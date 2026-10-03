-- ============================================================
-- 027_mlm_rls_member_access.sql
-- RLS: membros lêem os seus próprios dados MLM
-- + índices extra + coluna total_direct atualização
-- ============================================================

-- ── 1. mlm_nodes: membro lê/atualiza os seus próprios dados ─
DROP POLICY IF EXISTS "mlm_nodes_member_read" ON mlm_nodes;
CREATE POLICY "mlm_nodes_member_read"
  ON mlm_nodes FOR SELECT
  USING (auth.uid() = user_id);

-- ── 2. mlm_commissions: membro lê as suas comissões ─────────
DROP POLICY IF EXISTS "mlm_commissions_member_read" ON mlm_commissions;
CREATE POLICY "mlm_commissions_member_read"
  ON mlm_commissions FOR SELECT
  USING (auth.uid() = beneficiary_id);

-- ── 3. mlm_ranks: leitura pública (não contém dados sensíveis)
DROP POLICY IF EXISTS "mlm_ranks_public_read" ON mlm_ranks;
CREATE POLICY "mlm_ranks_public_read"
  ON mlm_ranks FOR SELECT
  USING (true);

-- ── 4. mlm_settings: leitura pública (só is_active importa para membros)
DROP POLICY IF EXISTS "mlm_settings_public_read" ON mlm_settings;
CREATE POLICY "mlm_settings_public_read"
  ON mlm_settings FOR SELECT
  USING (true);

-- ── 5. Índices extra para performance ───────────────────────
CREATE INDEX IF NOT EXISTS mlm_nodes_parent_node_id_idx
  ON mlm_nodes(parent_node_id);
CREATE INDEX IF NOT EXISTS mlm_nodes_left_child_id_idx
  ON mlm_nodes(left_child_id);
CREATE INDEX IF NOT EXISTS mlm_nodes_right_child_id_idx
  ON mlm_nodes(right_child_id);
CREATE INDEX IF NOT EXISTS mlm_commissions_from_user_idx
  ON mlm_commissions(from_user_id);

-- ── 6. total_direct: trigger para incrementar quando um nó é criado
CREATE OR REPLACE FUNCTION mlm_increment_direct_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sponsor_id IS NOT NULL THEN
    UPDATE mlm_nodes
    SET total_direct = total_direct + 1,
        updated_at   = NOW()
    WHERE user_id = NEW.sponsor_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mlm_increment_direct ON mlm_nodes;
CREATE TRIGGER trg_mlm_increment_direct
  AFTER INSERT ON mlm_nodes
  FOR EACH ROW EXECUTE FUNCTION mlm_increment_direct_count();

-- ── 7. Garantir que mlm_settings tem 1 linha ────────────────
INSERT INTO mlm_settings (id, is_active, direct_commission_pct)
VALUES (1, false, 20.00)
ON CONFLICT (id) DO NOTHING;
