-- =============================================================================
-- Migration: drop food_entries.meal_slot
-- Date:     2026-05-13
--
-- Surge no longer tracks meal slots (breakfast / lunch / dinner / snacks).
-- Food entries are now logged chronologically by `logged_at`.
--
-- Run this in the Supabase SQL editor.
-- Safe to re-run: ALTER TABLE ... DROP COLUMN IF EXISTS is idempotent.
-- =============================================================================

alter table public.food_entries
  drop column if exists meal_slot;
