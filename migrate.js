#!/usr/bin/env node
/**
 * Creates the database tables for the n8n template library.
 * Run once: node migrate.js
 */
const pool = require('./db');
const bcrypt = require('bcryptjs');

async function migrate() {
  // --- Auth tables ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_reset_token ON password_reset_tokens (token);

    CREATE TABLE IF NOT EXISTS session (
      sid VARCHAR NOT NULL COLLATE "default",
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL,
      PRIMARY KEY (sid)
    );
    CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
  `);

  // --- Content tables ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      icon TEXT DEFAULT '',
      description TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      total_views INTEGER DEFAULT 0,
      recent_views INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      user_username TEXT DEFAULT 'admin',
      user_verified BOOLEAN DEFAULT true,
      image JSONB DEFAULT '[]',
      nodes JSONB DEFAULT '[]',
      workflow_info JSONB DEFAULT '{}',
      workflow JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS template_categories (
      template_id INTEGER REFERENCES templates(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (template_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS collections (
      id SERIAL PRIMARY KEY,
      rank INTEGER DEFAULT 0,
      name TEXT NOT NULL,
      total_views INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS collection_workflows (
      collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
      template_id INTEGER REFERENCES templates(id) ON DELETE CASCADE,
      PRIMARY KEY (collection_id, template_id)
    );
  `);

  // Add description column if missing (upgrade path)
  await pool.query(`
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
  `);

  // Upgrade path: make email unique if it wasn't before, add password_reset_tokens
  await pool.query(`
    DO $$ BEGIN
      -- Drop old username unique constraint if it exists
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key') THEN
        ALTER TABLE users DROP CONSTRAINT users_username_key;
      END IF;
      -- Add unique constraint on email if not exists
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key') THEN
        ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
      END IF;
      -- Make email NOT NULL (update empty emails first)
      UPDATE users SET email = username || '@localhost' WHERE email IS NULL OR email = '';
      ALTER TABLE users ALTER COLUMN email SET NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Upgrade path note: %', SQLERRM;
    END $$;

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_reset_token ON password_reset_tokens (token);
  `);

  // Settings key-value store
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `);

  // Seed default categories if empty
  const { rowCount } = await pool.query('SELECT 1 FROM categories LIMIT 1');
  if (rowCount === 0) {
    await pool.query(`
      INSERT INTO categories (name) VALUES
        ('Sales'), ('Marketing'), ('DevOps'),
        ('Data & Storage'), ('Communication'), ('AI'), ('Utility')
    `);
    console.log('Seeded default categories.');
  }

  // Seed default admin user if no users exist
  const { rowCount: userCount } = await pool.query('SELECT 1 FROM users LIMIT 1');
  if (userCount === 0) {
    const hash = await bcrypt.hash('admin', 10);
    await pool.query(
      `INSERT INTO users (username, email, password_hash, role) VALUES ('admin', 'admin@localhost', $1, 'admin')`,
      [hash]
    );
    console.log('Created default admin user (email: admin@localhost, password: admin) — CHANGE THIS');
  }

  // --- Service Desk tables ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','in_progress','waiting','resolved','closed')),
      priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low','medium','high','critical')),
      category_id INTEGER REFERENCES ticket_categories(id) ON DELETE SET NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      execution_data JSONB DEFAULT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS execution_data JSONB DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
    CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets (assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets (created_by);

    CREATE TABLE IF NOT EXISTS ticket_comments (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      is_internal BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments (ticket_id);

    CREATE TABLE IF NOT EXISTS ticket_activity (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket ON ticket_activity (ticket_id);
  `);

  // Seed ticket categories
  const { rowCount: tcCount } = await pool.query('SELECT 1 FROM ticket_categories LIMIT 1');
  if (tcCount === 0) {
    await pool.query(`
      INSERT INTO ticket_categories (name, description) VALUES
        ('General', 'General support request'),
        ('Bug', 'Something is broken or not working correctly'),
        ('Feature Request', 'Request for a new feature or enhancement'),
        ('Question', 'Question about usage or configuration'),
        ('Access', 'Request for access or permissions change')
    `);
    console.log('Seeded default ticket categories.');
  }

  // --- Knowledge Base tables ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kb_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      parent_id INTEGER REFERENCES kb_categories(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_kb_categories_slug ON kb_categories (slug);
    CREATE INDEX IF NOT EXISTS idx_kb_categories_parent ON kb_categories (parent_id);

    CREATE TABLE IF NOT EXISTS kb_articles (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      body TEXT NOT NULL DEFAULT '',
      excerpt TEXT DEFAULT '',
      category_id INTEGER REFERENCES kb_categories(id) ON DELETE SET NULL,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
      is_pinned BOOLEAN DEFAULT FALSE,
      is_featured BOOLEAN DEFAULT FALSE,
      view_count INTEGER DEFAULT 0,
      helpful_yes INTEGER DEFAULT 0,
      helpful_no INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      published_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_kb_articles_slug ON kb_articles (slug);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_status ON kb_articles (status);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON kb_articles (category_id);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_pinned ON kb_articles (is_pinned) WHERE is_pinned = true;

    CREATE TABLE IF NOT EXISTS kb_tags (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE
    );
    CREATE INDEX IF NOT EXISTS idx_kb_tags_slug ON kb_tags (slug);

    CREATE TABLE IF NOT EXISTS kb_article_tags (
      article_id INTEGER REFERENCES kb_articles(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES kb_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (article_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_kb_article_tags_tag ON kb_article_tags (tag_id);

    CREATE TABLE IF NOT EXISTS kb_article_versions (
      id SERIAL PRIMARY KEY,
      article_id INTEGER NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      edited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      version_note TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_kb_versions_article ON kb_article_versions (article_id);

    CREATE TABLE IF NOT EXISTS kb_article_feedback (
      id SERIAL PRIMARY KEY,
      article_id INTEGER NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      helpful BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(article_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_kb_feedback_article ON kb_article_feedback (article_id);

    CREATE TABLE IF NOT EXISTS kb_article_attachments (
      id SERIAL PRIMARY KEY,
      article_id INTEGER NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_kb_attachments_article ON kb_article_attachments (article_id);
  `);

  // Full-text search support for kb_articles
  await pool.query(`
    ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS search_vector tsvector;
    CREATE INDEX IF NOT EXISTS idx_kb_articles_search ON kb_articles USING gin(search_vector);

    CREATE OR REPLACE FUNCTION kb_articles_search_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.title,'')), 'A')
        || setweight(to_tsvector('english', coalesce(NEW.excerpt,'')), 'B')
        || setweight(to_tsvector('english', coalesce(NEW.body,'')), 'C');
      RETURN NEW;
    END $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS kb_articles_search_trigger ON kb_articles;
    CREATE TRIGGER kb_articles_search_trigger
      BEFORE INSERT OR UPDATE OF title, excerpt, body ON kb_articles
      FOR EACH ROW EXECUTE FUNCTION kb_articles_search_update();
  `);

  // Seed default KB categories
  const { rowCount: kbCatCount } = await pool.query('SELECT 1 FROM kb_categories LIMIT 1');
  if (kbCatCount === 0) {
    await pool.query(`
      INSERT INTO kb_categories (name, slug, description, sort_order) VALUES
        ('Getting Started', 'getting-started', 'First steps and onboarding guides', 1),
        ('How-To Guides', 'how-to-guides', 'Step-by-step instructions', 2),
        ('Troubleshooting', 'troubleshooting', 'Common issues and solutions', 3),
        ('Best Practices', 'best-practices', 'Recommended patterns and tips', 4),
        ('FAQs', 'faqs', 'Frequently asked questions', 5)
    `);
    console.log('Seeded default KB categories.');
  }

  // --- Ticket-Execution linking ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_executions (
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      execution_id TEXT NOT NULL,
      workflow_id TEXT,
      workflow_name TEXT,
      status TEXT,
      linked_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (ticket_id, execution_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_executions_ticket ON ticket_executions (ticket_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_executions_exec ON ticket_executions (execution_id);
  `);

  // --- n8n Instances ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS n8n_instances (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      environment TEXT NOT NULL DEFAULT 'production',
      internal_url TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      is_default BOOLEAN DEFAULT FALSE,
      color TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Add workers column (upgrade path)
  await pool.query(`ALTER TABLE n8n_instances ADD COLUMN IF NOT EXISTS workers JSONB DEFAULT '[]'`);

  // Seed default instance from env vars if table is empty
  const { rowCount: instanceCount } = await pool.query('SELECT 1 FROM n8n_instances LIMIT 1');
  if (instanceCount === 0) {
    const envUrl = process.env.N8N_INTERNAL_URL || '';
    const envKey = process.env.N8N_API_KEY || '';
    if (envUrl) {
      await pool.query(
        `INSERT INTO n8n_instances (name, environment, internal_url, api_key, is_default, color) VALUES ($1, $2, $3, $4, TRUE, $5)`,
        ['Production', 'production', envUrl, envKey, '#22c55e']
      );
      console.log('Seeded default n8n instance from environment variables.');
    }
  }

  // --- API Keys ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Default',
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
      last_used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys (user_id);
  `);

  // --- MCP Servers ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'stdio' CHECK (type IN ('stdio', 'http')),
      command TEXT DEFAULT '',
      args JSONB DEFAULT '[]',
      env JSONB DEFAULT '{}',
      url TEXT DEFAULT '',
      auth_header TEXT DEFAULT '',
      enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // --- AI Conversations ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'New Chat',
      messages JSONB NOT NULL DEFAULT '[]',
      enabled_mcp_servers JSONB DEFAULT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations (user_id, updated_at DESC);
  `);

  // --- Notifications ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      link TEXT DEFAULT '',
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read, created_at DESC);
  `);

  // --- Audit Log ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);
  `);

  // --- Full-text search for templates and tickets ---
  await pool.query(`
    ALTER TABLE templates ADD COLUMN IF NOT EXISTS search_vector tsvector;
    CREATE INDEX IF NOT EXISTS idx_templates_search ON templates USING gin(search_vector);

    CREATE OR REPLACE FUNCTION templates_search_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.name,'')), 'A')
        || setweight(to_tsvector('english', coalesce(NEW.description,'')), 'B');
      RETURN NEW;
    END $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS templates_search_trigger ON templates;
    CREATE TRIGGER templates_search_trigger
      BEFORE INSERT OR UPDATE OF name, description ON templates
      FOR EACH ROW EXECUTE FUNCTION templates_search_update();

    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS search_vector tsvector;
    CREATE INDEX IF NOT EXISTS idx_tickets_search ON tickets USING gin(search_vector);

    CREATE OR REPLACE FUNCTION tickets_search_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.title,'')), 'A')
        || setweight(to_tsvector('english', coalesce(NEW.description,'')), 'B');
      RETURN NEW;
    END $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS tickets_search_trigger ON tickets;
    CREATE TRIGGER tickets_search_trigger
      BEFORE INSERT OR UPDATE OF title, description ON tickets
      FOR EACH ROW EXECUTE FUNCTION tickets_search_update();
  `);

  // Backfill search vectors for existing rows
  await pool.query(`
    UPDATE templates SET search_vector = setweight(to_tsvector('english', coalesce(name,'')), 'A')
      || setweight(to_tsvector('english', coalesce(description,'')), 'B')
    WHERE search_vector IS NULL;
    UPDATE tickets SET search_vector = setweight(to_tsvector('english', coalesce(title,'')), 'A')
      || setweight(to_tsvector('english', coalesce(description,'')), 'B')
    WHERE search_vector IS NULL;
  `);

  // --- Template Version History ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS template_versions (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      workflow JSONB NOT NULL,
      edited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      version_note TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_template_versions_template ON template_versions (template_id);
  `);

  // --- Webhook Integrations ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      events JSONB NOT NULL DEFAULT '[]',
      headers JSONB DEFAULT '{}',
      enabled BOOLEAN DEFAULT TRUE,
      last_triggered_at TIMESTAMPTZ,
      last_status INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // --- Two-Factor Authentication ---
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT DEFAULT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;
  `);

  // --- Scheduled Alerts ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      condition TEXT NOT NULL,
      config JSONB NOT NULL DEFAULT '{}',
      recipients JSONB NOT NULL DEFAULT '[]',
      cooldown_minutes INTEGER NOT NULL DEFAULT 30,
      enabled BOOLEAN DEFAULT TRUE,
      last_fired_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // --- Human-in-the-Loop (HITL) ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hitl_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      slug TEXT NOT NULL UNIQUE,
      schema JSONB NOT NULL DEFAULT '{"components":[]}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hitl_templates_slug ON hitl_templates (slug);

    CREATE TABLE IF NOT EXISTS hitl_requests (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES hitl_templates(id) ON DELETE CASCADE,
      callback_url TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      data JSONB NOT NULL DEFAULT '{}',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','request_changes')),
      assign_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      responded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      responded_at TIMESTAMPTZ,
      response_data JSONB DEFAULT '{}',
      response_comment TEXT DEFAULT '',
      callback_status INTEGER,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hitl_requests_status ON hitl_requests (status);
    CREATE INDEX IF NOT EXISTS idx_hitl_requests_template ON hitl_requests (template_id);
    CREATE INDEX IF NOT EXISTS idx_hitl_requests_created ON hitl_requests (created_at DESC);
  `);

  // --- HITL template active toggle ---
  await pool.query(`
    ALTER TABLE hitl_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
  `);

  // --- Instance references on tickets and KB articles ---
  await pool.query(`
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS instance_id INTEGER REFERENCES n8n_instances(id) ON DELETE SET NULL;
    ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS instance_id INTEGER REFERENCES n8n_instances(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_tickets_instance ON tickets (instance_id);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_instance ON kb_articles (instance_id);
  `);

  // --- Prompt Versioning ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prompts (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      variables JSONB DEFAULT '[]',
      category VARCHAR(100) DEFAULT '',
      tags TEXT[] DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
      current_version INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_prompts_slug ON prompts (slug);
    CREATE INDEX IF NOT EXISTS idx_prompts_status ON prompts (status);
    CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts (category);
    CREATE INDEX IF NOT EXISTS idx_prompts_created_by ON prompts (created_by);

    CREATE TABLE IF NOT EXISTS prompt_versions (
      id SERIAL PRIMARY KEY,
      prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      variables JSONB DEFAULT '[]',
      change_note TEXT DEFAULT '',
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(prompt_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt ON prompt_versions (prompt_id);
  `);

  // Full-text search for prompts
  await pool.query(`
    ALTER TABLE prompts ADD COLUMN IF NOT EXISTS search_vector tsvector;
    CREATE INDEX IF NOT EXISTS idx_prompts_search ON prompts USING gin(search_vector);

    CREATE OR REPLACE FUNCTION prompts_search_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector := setweight(to_tsvector('english', coalesce(NEW.name,'')), 'A')
        || setweight(to_tsvector('english', coalesce(NEW.description,'')), 'B')
        || setweight(to_tsvector('english', coalesce(NEW.content,'')), 'C');
      RETURN NEW;
    END $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS prompts_search_trigger ON prompts;
    CREATE TRIGGER prompts_search_trigger
      BEFORE INSERT OR UPDATE OF name, description, content ON prompts
      FOR EACH ROW EXECUTE FUNCTION prompts_search_update();
  `);

  // Backfill search vectors for existing prompts
  await pool.query(`
    UPDATE prompts SET search_vector = setweight(to_tsvector('english', coalesce(name,'')), 'A')
      || setweight(to_tsvector('english', coalesce(description,'')), 'B')
      || setweight(to_tsvector('english', coalesce(content,'')), 'C')
    WHERE search_vector IS NULL;
  `);

  console.log('Migration complete.');
  await pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
