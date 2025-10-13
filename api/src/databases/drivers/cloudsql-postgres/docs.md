# How to connect to a database using Cloud SQL Service Account

Enable IAM authentication for the database:
`gcloud sql instances patch dbi-main --database-flags cloudsql.iam_authentication=on --project realadvisor-prod`

Create a user for the service account:
`gcloud sql users create mako-revops@realadvisor-prod.iam --instance=dbi-main --type=cloud_iam_service_account`

Grant permissions to the user:

```sql
GRANT CONNECT ON DATABASE realadvisor TO "mako-revops@realadvisor-prod.iam";
GRANT USAGE ON SCHEMA public TO "mako-revops@realadvisor-prod.iam";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO "mako-revops@realadvisor-prod.iam";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "mako-revops@realadvisor-prod.iam";
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO "mako-revops@realadvisor-prod.iam";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO "mako-revops@realadvisor-prod.iam";
```

GRANT superuser TO "mako-revops@realadvisor-prod.iam";

```

```
