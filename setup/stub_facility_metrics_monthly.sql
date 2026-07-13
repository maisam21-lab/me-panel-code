-- Run in BigQuery (Console or bq query) once if facility_metrics_monthly does not exist yet.
-- Replace project/dataset if needed. Remove after the real table is available.

create table if not exists `css-operations.sales.facility_metrics_monthly` (
  date date,
  facility_id string,
  facility_name string,
  facility_country string,
  country_code string,
  cws_kitchen_no_member_transfer float64,
  cws_kitchen_member_transfer float64,
  cws_kitchen_renewal float64
);
