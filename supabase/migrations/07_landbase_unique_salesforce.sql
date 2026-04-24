-- Required for bulk upsert on salesforce_id
ALTER TABLE landbases
  ADD CONSTRAINT landbases_salesforce_id_unique UNIQUE (salesforce_id);