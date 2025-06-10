// Database: atlas.revops
// Get count of leads in ch_close_leads grouped by CRM, marking null as 'Undefined'

db.ch_close_leads.aggregate([
  {
    $group: {
      _id: {
        $ifNull: [{ $getField: { field: "CRM", input: "$custom" } }, "Unknown"],
      },
      lead_count: { $sum: 1 },
    },
  },
  {
    $project: {
      CRM: "$_id",
      lead_count: 1,
      _id: 0,
    },
  },
  { $sort: { lead_count: -1 } },
]);
