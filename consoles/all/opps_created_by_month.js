// Database: atlas.revops

db.ch_close_opportunities.aggregate([
  // Attach country/coll name as field
  {
    $project: {
      country: { $literal: "CH" },
      month: {
        $dateToString: { format: "%Y-%m", date: { $toDate: "$date_created" } },
      },
    },
  },
  {
    $unionWith: {
      coll: "es_close_opportunities",
      pipeline: [
        {
          $project: {
            country: { $literal: "ES" },
            month: {
              $dateToString: {
                format: "%Y-%m",
                date: { $toDate: "$date_created" },
              },
            },
          },
        },
      ],
    },
  },
  {
    $unionWith: {
      coll: "fr_close_opportunities_staging",
      pipeline: [
        {
          $project: {
            country: { $literal: "FR" },
            month: {
              $dateToString: {
                format: "%Y-%m",
                date: { $toDate: "$date_created" },
              },
            },
          },
        },
      ],
    },
  },
  // Group for pivot: (country, month)
  {
    $group: {
      _id: { country: "$country", month: "$month" },
      count: { $sum: 1 },
    },
  },
  // Gather all month-counts for each country
  {
    $group: {
      _id: "$_id.country",
      months: { $push: { k: "$_id.month", v: "$count" } },
    },
  },
  // Pivot, flat: { country: "...", "2024-05": 21, ... }
  { $addFields: { monthsObj: { $arrayToObject: "$months" } } },
  {
    $replaceRoot: {
      newRoot: {
        $mergeObjects: [{ country: "$_id" }, "$monthsObj"],
      },
    },
  },
]);
