export function snowflakeSchemaSQL(schema: string, node: number): string {
  if (
    !/^[a-z][a-z0-9_]{0,62}$/.test(schema) ||
    !Number.isInteger(node) ||
    node < 0 ||
    node > 1023
  )
    throw Error("Invalid Snowflake namespace");
  return `
CREATE TABLE IF NOT EXISTS ${schema}.snowflake_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 last_ms bigint NOT NULL DEFAULT 0,
 sequence integer NOT NULL DEFAULT -1 CHECK (sequence BETWEEN -1 AND 4095)
);
INSERT INTO ${schema}.snowflake_state(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION ${schema}.next_snowflake() RETURNS text LANGUAGE plpgsql AS $$
DECLARE wall_ms bigint; next_ms bigint; last_value bigint; counter integer;
BEGIN
 wall_ms := floor(extract(epoch FROM clock_timestamp())*1000)::bigint - 1767225600000;
 SELECT last_ms, sequence INTO last_value, counter FROM ${schema}.snowflake_state WHERE singleton FOR UPDATE;
 next_ms := greatest(wall_ms,last_value);
 IF next_ms > last_value THEN counter := 0;
 ELSIF counter = 4095 THEN next_ms := next_ms+1; counter := 0;
 ELSE counter := counter+1;
 END IF;
 IF next_ms-wall_ms > 5000 THEN RAISE EXCEPTION 'Snowflake clock drift exceeds five seconds' USING ERRCODE='54000'; END IF;
 IF next_ms < 0 OR next_ms >= 2199023255552 THEN RAISE EXCEPTION 'Snowflake epoch range exceeded' USING ERRCODE='54000'; END IF;
 UPDATE ${schema}.snowflake_state SET last_ms=next_ms, sequence=counter WHERE singleton;
 RETURN ((next_ms << 22) | (${node}::bigint << 12) | counter::bigint)::text;
END;
$$;
`;
}
