/*
# Add avatar_url to profiles

## Overview
Adds an optional `avatar_url` column to `profiles` so the profile picture
returned by OAuth providers (Google, GitHub) can be stored. Purely additive —
does not change any existing column, policy, or table.

## Changes
- `profiles.avatar_url` (text, nullable, default '') — provider avatar URL,
  populated on first OAuth sign-in when available.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text NOT NULL DEFAULT '';
