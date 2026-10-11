-- External research is not a paid model receipt or an automatic rule.
ALTER TABLE analyses ADD CONSTRAINT analyses_origin_external_check CHECK (origin IN ('model', 'replay', 'rule', 'external_agent')) NOT VALID;
