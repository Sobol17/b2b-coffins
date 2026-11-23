INSERT INTO dict_items (dict, code, title, sort_order)
VALUES
    ('coffin_size', '50', '50 см (маленький)', 50),
    ('coffin_size', '80', '80 см (маленький)', 80),
    ('coffin_size', '100', '100 см (маленький)', 100),
    ('coffin_size', '120', '120 см (маленький)', 120),
    ('coffin_size', '140', '140 см (маленький)', 140),
    ('coffin_size', '160', '160 см', 160),
    ('coffin_size', '170', '170 см', 170),
    ('coffin_size', '180', '180 см', 180),
    ('coffin_size', '190', '190 см', 190),
    ('coffin_size', '200', '200 см', 200),
    ('coffin_size', '210', '210 см', 210),
    ('coffin_size', '220', '220 см', 220)
ON CONFLICT (dict, code) DO NOTHING;
--> statement-breakpoint
WITH approved(title) AS (
    VALUES ('Белый'), ('Евро'), ('Красное дерево'), ('Орех')
)
INSERT INTO options (kind, title)
SELECT 'color', approved.title
FROM approved
WHERE NOT EXISTS (
    SELECT 1 FROM options WHERE kind = 'color' AND title = approved.title
);
--> statement-breakpoint
UPDATE options SET is_active = 1
WHERE kind = 'color' AND title IN ('Белый', 'Евро', 'Красное дерево', 'Орех');
--> statement-breakpoint
UPDATE options SET is_active = 0
WHERE kind = 'color' AND title IN ('Венге', 'Чёрный');
--> statement-breakpoint
INSERT INTO options (kind, title)
VALUES ('gloss', 'Матовый'), ('gloss', 'Глянцевый');
