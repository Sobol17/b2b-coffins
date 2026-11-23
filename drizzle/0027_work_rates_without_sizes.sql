-- Refuse ambiguous legacy prices rather than silently choosing a size's rate.
CREATE TEMP TABLE payroll_rate_guard (ok INTEGER NOT NULL CHECK (ok = 1));
--> statement-breakpoint
INSERT INTO payroll_rate_guard
SELECT CASE WHEN EXISTS (
 SELECT 1 FROM work_types w JOIN product_variants v ON v.id = w.variant_id
 GROUP BY v.product_id, v.material_id, w.role_code
 HAVING count(DISTINCT w.rate_minor) > 1 OR count(DISTINCT w.is_active) > 1
) THEN 0 ELSE 1 END;
--> statement-breakpoint
CREATE TEMP TABLE payroll_rate_map AS
SELECT w.id AS old_id,
 (SELECT w2.id FROM work_types w2 JOIN product_variants v2 ON v2.id = w2.variant_id
  WHERE v2.product_id = v.product_id AND v2.material_id = v.material_id AND w2.role_code IS w.role_code ORDER BY v2.id, w2.id LIMIT 1) AS keep_id,
 (SELECT min(v3.id) FROM product_variants v3 WHERE v3.product_id = v.product_id AND v3.material_id = v.material_id) AS position_id
FROM work_types w JOIN product_variants v ON v.id = w.variant_id;
--> statement-breakpoint
-- Keep historical work identities and frozen entries separate. Retired size-specific
-- rates remain accessible only from days that already contain them.
UPDATE work_types SET is_active = 0
WHERE id IN (SELECT old_id FROM payroll_rate_map WHERE old_id != keep_id);
--> statement-breakpoint
UPDATE work_types SET variant_id = (SELECT position_id FROM payroll_rate_map WHERE old_id = work_types.id)
WHERE id IN (SELECT keep_id FROM payroll_rate_map);
--> statement-breakpoint
DROP TABLE payroll_rate_map;
--> statement-breakpoint
DROP TABLE payroll_rate_guard;
