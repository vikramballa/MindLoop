-- Runs once on first container start. Schema itself is managed by Alembic.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE DATABASE mindloop_test;
\connect mindloop_test
CREATE EXTENSION IF NOT EXISTS vector;
