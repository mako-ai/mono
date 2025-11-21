---
title: Connect Databases
description: Learn how to connect your external databases to Mako.
---

## MongoDB Atlas

In MongoDB Atlas, when you click "connect" to your data source in your account, the website gives you a string that looks like this:

`mongodb+srv://<db_username>:<db_password>@<cluster_name>.<server_name>.mongodb.net/?appName=<cluster_name>`

In Mako, you actually need to paste this URL:

`mongodb+srv://<db_username>:<db_password>@<cluster_name>.<server_name>.mongodb.net/<cluster_name>`

(notice the query param vs the segment)
