-- Uso: /api/q/meta-campaigns
SELECT DISTINCT campaign_id, campaign_name
FROM meta_ad_entities
WHERE campaign_id IS NOT NULL
ORDER BY campaign_name;
