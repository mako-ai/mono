// atlas.revops
// International ARR (in EUR, by cents divided by 100) only won deals with active-customer leads, grouped by country and month (yyyy-mm), formatted as one document per country, months as columns.

db.fr_close_opportunities_staging.aggregate([
  // --- France ---
  // 1. Only WON deals with valid lead, and join active customers
  {$match: {status_type: "won", lead_id: {$ne: null}, date_won: {$exists: true, $ne: null}}},
  {$match: {annualized_value: {$gt: 0}}},
  // 2. Extract month
  {$addFields: {country: "France", month: {$substr: ["$date_won", 0, 7]}}},
  // 3. Sum per country+month
  // CHF values are not present - for France we assume EUR
  {$group: {
    _id: {country: "$country", month: "$month"},
    ARR_EUR: {$sum: {$divide: ["$annualized_value", 100]}}
  }},
  // --- Switzerland ---
  {$unionWith: {
    coll: "ch_close_opportunities",
    pipeline: [
      {$match: {status_type: "won", lead_id: {$ne: null}, date_won: {$exists: true, $ne: null}}},
      {$match: {annualized_value: {$gt: 0}}},
      {$addFields: {country: "Switzerland", month: {$substr: ["$date_won", 0, 7]}}},
      {$group: {_id: {country: "$country", month: "$month"}, ARR_EUR: {$sum: {$divide: ["$annualized_value", 100]}}}}
    ]
  }},
  // --- Spain ---
  {$unionWith: {
    coll: "es_close_opportunities",
    pipeline: [
      {$match: {status_type: "won", lead_id: {$ne: null}, date_won: {$exists: true, $ne: null}}},
      {$match: {annualized_value: {$gt: 0}}},
      {$addFields: {country: "Spain", month: {$substr: ["$date_won", 0, 7]}}},
      {$group: {_id: {country: "$country", month: "$month"}, ARR_EUR: {$sum: {$divide: ["$annualized_value", 100]}}}}
    ]
  }},
  // --- Combine by country ---
  {
    $group: {
      _id: "$_id.country",
      months: {$push: {k: {$toString: "$_id.month"}, v: "$ARR_EUR"}},
      total: {$sum: "$ARR_EUR"}
    }
  },
  // Sort months keys inside each country
  {
    $addFields: {
      months: {
        $sortArray: {input: "$months", sortBy: {k: 1}}
      }
    }
  },
  // Shape as flat row, one doc per country
  {
    $replaceRoot: {
      newRoot: {
        $mergeObjects: [
          {country: "$_id"},
          {$arrayToObject: "$months"},
          {"total (all months)": "$total"}
        ]
      }
    }
  },
  // Final sort
  {$sort: {"total (all months)": -1}}
])