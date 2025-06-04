// Database: atlas.revops

db.ch_close_leads.aggregate([
  // Attach country/coll name as field
  { $project: {
      country: { $literal: "CH" },
      month: { $dateToString: { format: "%Y-%m", date: { $toDate: "$date_created" } } }
  }},
  { $unionWith: {
      coll: "es_close_leads",
      pipeline: [
        { $project: {
            country: { $literal: "ES" },
            month: { $dateToString: { format: "%Y-%m", date: { $toDate: "$date_created" } } }
        }}
      ]
  }},
  { $unionWith: {
      coll: "fr_close_leads",
      pipeline: [
        { $project: {
            country: { $literal: "FR" },
            month: { $dateToString: { format: "%Y-%m", date: { $toDate: "$date_created" } } }
        }}
      ]
  }},
  { $group: {
      _id: { country: "$country", month: "$month" },
      count: { $sum: 1 }
  }},
  { $group: {
      _id: "$_id.country",
      months: { $push: { k: "$_id.month", v: "$count" } }
  }},
  { $addFields: { monthsObj: { $arrayToObject: "$months" } } },
  {
    $replaceRoot: {
      newRoot: {
        $mergeObjects: [
          { country: "$_id" },
          "$monthsObj"
        ]
      }
    }
  }
])