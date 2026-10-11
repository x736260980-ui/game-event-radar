-- The wider constraint is validated before retiring the narrower one. No rows are changed.
ALTER TABLE analyses DROP CONSTRAINT analyses_origin_check;
