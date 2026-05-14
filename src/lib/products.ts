// src/lib/products.ts
//
// Product names that can appear at any stage of a wool supply
// chain. Used by the purchase form, processing form, and any
// other form that needs a product picker.
//
// Stored as plain text in the database — adding or removing a
// value here doesn't require a migration. Just edit the list,
// commit, push.

export const WOOL_PRODUCTS = [
    'Greasy Wool',
    'Scoured Wool',
    'Carded Wool',
    'Wool Tops',
    'Yarn',
    'Woven Fabric',
    'Knitted Fabric',
    'Felt',
    'Garments',
  ] as const
  
  export type WoolProduct = (typeof WOOL_PRODUCTS)[number]