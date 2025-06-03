# RevOps Custom Prompt

## Business Context

We are a RevOps platform that helps sales teams track and analyze their performance. Our main entities are leads, opportunities, contacts, and activities.

## Data Relationships

- Opportunities (deals) belong to Leads (accounts)
- Contacts are associated with Leads
- Activities (calls, emails, meetings) are linked to both Opportunities and Contacts
- Each Opportunity has a closer (sales rep) assigned

## Common Queries

- Monthly sales performance by closer
- Deal pipeline analysis
- Account engagement metrics
- Activity volume trends

## Custom Instructions

When analyzing sales data, always consider:

- Segment results by time period (monthly/quarterly)
- Include closer performance comparisons
- Show pipeline conversion rates when relevant
- Highlight trends and anomalies in the data
