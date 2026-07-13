-- =============================================================================
-- refresh_ae_segment.sql
-- Builds css-operations.me_panel_dev_us.me_ae_segment: every ME-roster AE
-- classified Delivery vs Cloud Retail, driven ENTIRELY by the closed-won
-- kitchen_type TAG (kitchen_type = 'CloudRetail' vs Delivery) — NOT by manager
-- name / title / role-id (none of those carry segment; verified empty/ambiguous).
--
-- Keyed on the SFDC user id: sf_opportunities.closed_won_owner_id = user_history_new.id.
--
-- segment_source:
--   'deal_tag'         - AE has their OWN closed-won deals; segment = the dominant
--                        kitchen_type they actually sold (handles the few "mixed"
--                        sellers by majority).
--   'manager_team_tag' - AE has 0 deals (new / ramping); inherits the dominant
--                        segment of their MANAGER'S TEAM. The team segment is itself
--                        tag-derived (sum of the team's closed-won kitchen_type), so
--                        there is still no hardcoded string anywhere — the hierarchy
--                        is only used to PROPAGATE a tag to a zero-deal rep.
--   'unclassified'     - 0 deals and no tagged teammates (rare; treat as needs-review).
--
-- GRAIN: one row per AE (ae_id). Lookback 2024-01-01 for a stable segment.
--
-- Run BEFORE refresh_ae_trial.sql (the AE headcount there joins this to keep
-- Delivery AEs only in the productivity denominator).
--   bq query --nouse_legacy_sql --location=US < setup/refresh_ae_segment.sql
-- =============================================================================

CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_ae_segment` AS
WITH deal_seg AS (                       -- each closer's lifetime ME CWs split by tag
  SELECT closed_won_owner_id                         AS ae_id,
         ANY_VALUE(closed_won_owner)                 AS ae_name,
         COUNTIF(kitchen_type = 'CloudRetail')       AS cr_cws,
         COUNTIF(kitchen_type_cleaned = 'Delivery')  AS delivery_cws
  FROM `css-operations.sales.sf_opportunities`
  WHERE closed_won
    AND closed_won_owner_id IS NOT NULL
    AND NOT COALESCE(transfer_cw, FALSE)
    AND facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND closed_won_date >= DATE '2024-01-01'
  GROUP BY ae_id
),
roster AS (                              -- current ME AE roster, one row per person
  SELECT id                     AS ae_id,
         ANY_VALUE(name)        AS roster_name,
         ANY_VALUE(country)     AS country,
         ANY_VALUE(manager_id)  AS manager_id
  FROM `css-operations.sales.user_history_new`
  WHERE role = 'AE'
    AND ( LOWER(TRIM(country)) IN ('uae','kuwait','saudi arabia','bahrain','qatar')
          OR LOWER(country) LIKE '%emirat%' )
  GROUP BY id
),
mgr_team AS (                            -- a manager's team segment = sum of reports' tagged deals
  SELECT r.manager_id,
         SUM(COALESCE(d.delivery_cws,0)) AS team_dl,
         SUM(COALESCE(d.cr_cws,0))       AS team_cr
  FROM roster r
  LEFT JOIN deal_seg d ON d.ae_id = r.ae_id
  GROUP BY r.manager_id
),
mgr_own AS (                             -- managers also close deals themselves
  SELECT ae_id AS manager_id, delivery_cws AS m_dl, cr_cws AS m_cr FROM deal_seg
),
mgr_label AS (
  SELECT t.manager_id,
         CASE WHEN (COALESCE(t.team_dl,0)+COALESCE(o.m_dl,0))
                 >= (COALESCE(t.team_cr,0)+COALESCE(o.m_cr,0))
              THEN 'Delivery' ELSE 'Cloud Retail' END AS mgr_segment
  FROM mgr_team t
  LEFT JOIN mgr_own o USING (manager_id)
  WHERE (COALESCE(t.team_dl,0)+COALESCE(o.m_dl,0)
         +COALESCE(t.team_cr,0)+COALESCE(o.m_cr,0)) > 0
)
SELECT
  r.ae_id,
  COALESCE(d.ae_name, r.roster_name)                                       AS ae_name,
  r.country,
  COALESCE(
    CASE WHEN d.ae_id IS NOT NULL
         THEN CASE WHEN d.delivery_cws >= d.cr_cws THEN 'Delivery' ELSE 'Cloud Retail' END
    END,
    ml.mgr_segment,
    'Unknown'
  )                                                                        AS segment,
  CASE WHEN d.ae_id IS NOT NULL          THEN 'deal_tag'
       WHEN ml.mgr_segment IS NOT NULL   THEN 'manager_team_tag'
       ELSE 'unclassified' END                                            AS segment_source,
  COALESCE(d.delivery_cws,0)                                              AS delivery_cws,
  COALESCE(d.cr_cws,0)                                                    AS cr_cws,
  (COALESCE(d.delivery_cws,0) > 0 AND COALESCE(d.cr_cws,0) > 0)           AS is_mixed
FROM roster r
LEFT JOIN deal_seg  d  ON d.ae_id = r.ae_id
LEFT JOIN mgr_label ml ON ml.manager_id = r.manager_id;
