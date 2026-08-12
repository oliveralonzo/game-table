CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    auth_provider TEXT NOT NULL,
    auth_subject TEXT NOT NULL,
    username TEXT NOT NULL,
    username_key TEXT NOT NULL,
    table_nickname TEXT,
    rating INTEGER,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    UNIQUE (auth_provider, auth_subject),
    UNIQUE (username_key)
);

CREATE TABLE IF NOT EXISTS game_history (
    id TEXT PRIMARY KEY,
    completed_at BIGINT NOT NULL,
    table_code TEXT NOT NULL,
    rounds_played INTEGER NOT NULL,
    team_scores JSONB NOT NULL,
    team_player_counts JSONB NOT NULL,
    winning_team_index INTEGER NOT NULL
);

ALTER TABLE game_history
    ADD COLUMN IF NOT EXISTS team_player_counts JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS account_game_results (
    game_history_id TEXT NOT NULL REFERENCES game_history(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    seat_index INTEGER NOT NULL,
    team_index INTEGER NOT NULL,
    won BOOLEAN NOT NULL,
    points_for INTEGER NOT NULL,
    points_against INTEGER NOT NULL,
    PRIMARY KEY (game_history_id, account_id)
);

CREATE INDEX IF NOT EXISTS account_game_results_account_idx
    ON account_game_results (account_id);

CREATE INDEX IF NOT EXISTS account_game_results_game_idx
    ON account_game_results (game_history_id);
