import { useEffect, useRef, useState } from 'react';
import { QrCode, Download, Printer, Power, MapPin, Link2, Check } from 'lucide-react';
import { useCampus } from '@/context/CampusContext';
import { useSettings } from '@/context/SettingsContext';
import { useNavigate } from '@/lib/router';
import { getQRCodes, toggleQRCode } from '@/lib/extension-api';
import { EmptyState } from '@/components/ui';
import {
  buildQrUrl,
  renderQrToCanvas,
  generateQrPngDataUrl,
  generateQrSvgMarkup,
  triggerDownload,
  safeFileName,
} from '@/lib/qr-utils';

interface QRItem {
  id: string;
  location_id: string;
  code: string;
  is_active: boolean;
}

/**
 * Aperçu live d'un vrai QR code (rendu canvas, standard QR), utilisé dans
 * chaque carte avant tout téléchargement/impression.
 */
function QrThumbnail({ url, size = 120 }: { url: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (canvasRef.current) {
      renderQrToCanvas(canvasRef.current, url, { size: size * 2, margin: 1 }).catch((err) => {
        if (!cancelled) console.error('QR render error:', err);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="rounded-xl bg-white"
      aria-label="Aperçu du QR code"
    />
  );
}

export function QRPage() {
  const { locations } = useCampus();
  const { t } = useSettings();
  const go = useNavigate();
  const [codes, setCodes] = useState<QRItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    getQRCodes()
      .then(setCodes)
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (id: string, active: boolean) => {
    await toggleQRCode(id, active);
    setCodes((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_active: active } : c)),
    );
  };

  const handleDownloadPng = async (code: string) => {
    const url = buildQrUrl(code);
    const dataUrl = await generateQrPngDataUrl(url, { size: 1024, margin: 2 });
    triggerDownload(dataUrl, `qr-${safeFileName(code)}.png`);
  };

  const handleDownloadSvg = async (code: string) => {
    const url = buildQrUrl(code);
    const svg = await generateQrSvgMarkup(url, { size: 1024, margin: 2 });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, `qr-${safeFileName(code)}.svg`);
    URL.revokeObjectURL(objectUrl);
  };

  const handlePrint = async (code: string, locationName: string) => {
    const url = buildQrUrl(code);
    const svg = await generateQrSvgMarkup(url, { size: 480, margin: 2 });
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>QR ${code}</title></head>
      <body style="display:grid;place-items:center;height:100vh;margin:0;font-family:sans-serif">
        <div style="text-align:center">
          <h2 style="color:#111d47;margin-bottom:8px">HEC LOCALISATION</h2>
          <div style="display:inline-block;padding:16px;border:1px solid #e5e7eb;border-radius:16px">${svg}</div>
          <p style="color:#111d47;font-weight:600;margin-top:16px;margin-bottom:4px">${locationName}</p>
          <p style="font-family:monospace;font-size:16px;color:#1e5eff;margin:0 0 8px">${code}</p>
          <p style="color:#666;margin:0">Scannez pour localiser ce lieu</p>
        </div>
      </body></html>`);
    win.document.close();
    win.focus();
    // Laisse le temps au navigateur de peindre le SVG avant l'impression
    setTimeout(() => win.print(), 250);
  };

  const handleCopyLink = async (id: string, code: string) => {
    const url = buildQrUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch (err) {
      console.error('Clipboard error:', err);
    }
  };

  if (loading)
    return <p className="px-5 py-6 text-sm text-slate-500">{t('common.loading')}</p>;

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 lg:px-8 lg:py-10">
      <div className="flex items-center gap-2">
        <QrCode className="h-6 w-6 text-hec-500" />
        <h1 className="font-display text-2xl font-bold text-hec-950">
          {t('qr.title')}
        </h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">{t('qr.subtitle')}</p>

      {codes.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<QrCode className="h-5 w-5" />}
            title={t('common.noResults')}
            description=""
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {codes.map((qr) => {
            const loc = locations.find((l) => l.id === qr.location_id);
            const url = buildQrUrl(qr.code);
            return (
              <div
                key={qr.id}
                className={`rounded-2xl border bg-white p-5 ${
                  qr.is_active ? 'border-slate-100' : 'border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 overflow-hidden rounded-xl border border-slate-100">
                    <QrThumbnail url={url} size={72} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-hec-950">
                      {loc?.name ?? 'Lieu'}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">
                      {qr.code}
                    </p>
                    {loc && (
                      <button
                        onClick={() => go('/map', { loc: loc.id })}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-hec-600 hover:text-hec-700"
                      >
                        <MapPin className="h-3 w-3" />
                        {t('common.seeOnMap')}
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleDownloadPng(qr.code)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t('qr.downloadPng')}
                  </button>
                  <button
                    onClick={() => handleDownloadSvg(qr.code)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t('qr.downloadSvg')}
                  </button>
                  <button
                    onClick={() => handlePrint(qr.code, loc?.name ?? 'Lieu')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    {t('qr.print')}
                  </button>
                  <button
                    onClick={() => handleCopyLink(qr.id, qr.code)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {copiedId === qr.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                    {copiedId === qr.id ? t('qr.copied') : t('qr.copyLink')}
                  </button>
                  <button
                    onClick={() => handleToggle(qr.id, !qr.is_active)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      qr.is_active
                        ? 'border-red-100 text-red-500 hover:bg-red-50'
                        : 'border-emerald-100 text-emerald-600 hover:bg-emerald-50'
                    }`}
                  >
                    <Power className="h-3.5 w-3.5" />
                    {qr.is_active ? t('qr.deactivate') : 'Activer'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
