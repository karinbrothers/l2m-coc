-- Migration 58: landbase coordinates
-- ============================================================
-- Mirrors the Salesforce fields Latitude__c and Longitude__c
-- on the Land_Base__c object. Used to plot landbases on the
-- Mapbox map at /landbases/map.

alter table public.landbases
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;