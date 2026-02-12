-- migrate:up
-- 1. Unique slug per published version (invariant 1.1)
-- Explicit constraint name for predictability
ALTER TABLE microsite_page_versions
    ADD CONSTRAINT mpv_microsite_version_slug_uq UNIQUE (microsite_version_id, slug);

-- 2. Performance indexes for public reads (invariant 1.2)
-- Nav lookup: (version_id, position)
CREATE INDEX mpv_microsite_version_pos_idx 
    ON microsite_page_versions (microsite_version_id, position);

-- Optional: Explicit index for public page fetch if not fully covered by UNIQUE constraint in all PG versions
-- but UNIQUE (a,b) covers lookup by (a,b). 
-- Adding just in case for clarity or future partial indexing.
CREATE INDEX mpv_microsite_version_slug_idx 
    ON microsite_page_versions (microsite_version_id, slug);

-- migrate:down
DROP INDEX IF EXISTS mpv_microsite_version_slug_idx;
DROP INDEX IF EXISTS mpv_microsite_version_pos_idx;
ALTER TABLE microsite_page_versions DROP CONSTRAINT mpv_microsite_version_slug_uq;
