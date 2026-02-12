-- migrate:up
CREATE TABLE microsites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    published_version INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(event_id)
);

CREATE TABLE microsite_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    microsite_id UUID NOT NULL REFERENCES microsites(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
    seo JSONB NOT NULL DEFAULT '{}'::jsonb,
    visibility TEXT NOT NULL DEFAULT 'PUBLIC',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(microsite_id, slug)
);
CREATE INDEX mp_slug_idx ON microsite_pages(microsite_id, slug);
CREATE INDEX mp_pos_idx ON microsite_pages(microsite_id, position);

CREATE TABLE microsite_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  microsite_id UUID NOT NULL REFERENCES microsites(id) ON DELETE CASCADE,
  version INT NOT NULL,
  settings JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  UNIQUE(microsite_id, version)
);

CREATE TABLE microsite_page_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    microsite_id UUID NOT NULL REFERENCES microsites(id) ON DELETE CASCADE,
    microsite_version_id UUID NOT NULL REFERENCES microsite_versions(id) ON DELETE CASCADE,
    page_id UUID NOT NULL REFERENCES microsite_pages(id) ON DELETE CASCADE,
    version INT NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    position INT NOT NULL,
    blocks JSONB NOT NULL,
    seo JSONB NOT NULL,
    visibility TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users(id),
    UNIQUE(page_id, version)
);
CREATE INDEX mpv_microsite_version_idx ON microsite_page_versions(microsite_id, version);
CREATE INDEX mpv_parent_version_idx ON microsite_page_versions(microsite_version_id);

-- migrate:down
DROP TABLE microsite_page_versions;
DROP TABLE microsite_versions;
DROP TABLE microsite_pages;
DROP TABLE microsites;
