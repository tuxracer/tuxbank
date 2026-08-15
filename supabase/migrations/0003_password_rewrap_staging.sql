-- Two-phase password change: staging columns for the previous password's
-- DEK wrap.
--
-- A password change touches two systems that cannot be updated atomically:
-- the auth password and the key_material wrap columns. The client now stages
-- the new wrap while keeping the old one (these columns) BEFORE flipping the
-- auth password, and clears them after. Whichever password the account ends
-- up accepting, one of the two wraps opens under it, so a failure between
-- the steps can no longer lock every other device out of the account.

alter table public.key_material
  add column wrapped_dek_prev text,
  add column wrapped_dek_prev_nonce text;
