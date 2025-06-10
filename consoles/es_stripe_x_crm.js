// Database: atlas.revops
db.es_close_leads.aggregate([
  /* 1️⃣  Pull the Close custom-fields we need */
  {
    $addFields: {
      team_id: { $getField: { field: "Team ID", input: "$custom" } },
      csm_owner_id: { $getField: { field: "CSM Owner", input: "$custom" } },
      renewal_probability: {
        $getField: { field: "Renewal Probability", input: "$custom" },
      },
      client_won_date_raw: {
        $getField: { field: "Client Won Date", input: "$custom" },
      },
    },
  },

  /* 2️⃣  Keep only leads that …   
        • are linked to a RealAdvisor team  
        • whose status_label contains “customer” (case-insensitive) */
  {
    $match: {
      team_id: { $exists: true, $ne: null },
      status_label: { $regex: "customer", $options: "i" },
    },
  },

  /* 3️⃣  Join with RealAdvisor teams */
  {
    $lookup: {
      from: "realadvisor_graphql_teams",
      localField: "team_id",
      foreignField: "id",
      as: "team",
    },
  },
  { $unwind: "$team" },

  /* 4️⃣  Resolve the CSM owner (Close users) */
  {
    $lookup: {
      from: "es_close_users",
      localField: "csm_owner_id",
      foreignField: "id",
      as: "csm",
    },
  },
  { $unwind: { path: "$csm", preserveNullAndEmptyArrays: true } },

  /* 5️⃣  Derive all RealAdvisor metrics we need */
  {
    $addFields: {
      /* ---------- Team-member level metrics ---------- */
      reviews_count: {
        $sum: {
          $map: {
            input: { $ifNull: ["$team.teams_users", []] },
            as: "tu",
            in: { $ifNull: ["$$tu.user.reviews_aggregate.aggregate.count", 0] },
          },
        },
      },
      last_review_date_raw: {
        $reduce: {
          input: {
            $map: {
              input: { $ifNull: ["$team.teams_users", []] },
              as: "tu",
              in: "$$tu.user.reviews_aggregate.aggregate.max.created_at",
            },
          },
          initialValue: null,
          in: { $cond: [{ $gt: ["$$this", "$$value"] }, "$$this", "$$value"] },
        },
      },
      /* NEW ➜ appraisal requests & CRM leads */
      appraisal_requests_count: {
        $sum: {
          $map: {
            input: { $ifNull: ["$team.teams_users", []] },
            as: "tu",
            in: {
              $ifNull: ["$$tu.user.appraisal_requests.aggregate.count", 0],
            },
          },
        },
      },
      crm_leads_count: {
        $sum: {
          $map: {
            input: { $ifNull: ["$team.teams_users", []] },
            as: "tu",
            in: { $ifNull: ["$$tu.user.assigned_leads.aggregate.count", 0] },
          },
        },
      },
      team_members_count: { $size: { $ifNull: ["$team.teams_users", []] } },

      /* ---------- Transaction metrics ---------- */
      transactions_count: {
        $ifNull: ["$team.property_transactions_aggregate.aggregate.count", 0],
      },
      last_transaction_date_raw:
        "$team.property_transactions_aggregate.aggregate.max.created_at",

      /* ---------- Flag: show on agency pages ---------- */
      show_in_agency_pages_flag: { $eq: ["$team.show_in_agency_pages", true] },
    },
  },

  /* 6️⃣  Strip the time component from every date (YYYY-MM-DD) */
  {
    $addFields: {
      client_won_date: {
        $cond: [
          { $eq: [{ $type: "$client_won_date_raw" }, "date"] },
          {
            $dateToString: { format: "%Y-%m-%d", date: "$client_won_date_raw" },
          },
          { $substrBytes: ["$client_won_date_raw", 0, 10] },
        ],
      },
      last_review_date: {
        $cond: [
          { $eq: [{ $type: "$last_review_date_raw" }, "date"] },
          {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$last_review_date_raw",
            },
          },
          { $substrBytes: ["$last_review_date_raw", 0, 10] },
        ],
      },
      last_transaction_date: {
        $cond: [
          { $eq: [{ $type: "$last_transaction_date_raw" }, "date"] },
          {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$last_transaction_date_raw",
            },
          },
          { $substrBytes: ["$last_transaction_date_raw", 0, 10] },
        ],
      },
    },
  },

  /* 7️⃣  Flatten to a tidy, column-friendly object */
  {
    $replaceRoot: {
      newRoot: {
        close_id: "$id",
        team_id: "$team_id",
        close_name: "$display_name",
        team_name: "$team.name",
        csm_owner_id: "$csm_owner_id",
        csm_owner_name: {
          $concat: [
            { $ifNull: ["$csm.first_name", ""] },
            " ",
            { $ifNull: ["$csm.last_name", ""] },
          ],
        },
        lead_status: "$status_label",
        renewal_probability: "$renewal_probability",
        client_won_date: "$client_won_date",

        reviews_count: "$reviews_count",
        last_review_date: "$last_review_date",

        transactions_count: "$transactions_count",
        last_transaction_date: "$last_transaction_date",

        appraisal_requests_count: "$appraisal_requests_count",
        crm_leads_count: "$crm_leads_count",

        team_members_count: "$team_members_count",
        show_in_agency_pages: "$show_in_agency_pages_flag",
      },
    },
  },

  /* 8️⃣  Cap the output */
  { $limit: 100 },
]);
