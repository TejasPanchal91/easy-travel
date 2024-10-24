const express = require("express");
const app = express();
const cors = require("cors");
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const hubspot = require("@hubspot/api-client");

const hubspotClient = new hubspot.Client({
  accessToken: "",
});

app.post("/createList", async (req, res) => {
  const ListCreateRequest = {
    objectTypeId: "0-1",
    processingType: "MANUAL",
    name: "Test List with Filters",
    listFolderId: 0,
  };

  try {
    const apiResponse = await hubspotClient.crm.lists.listsApi.create(
      ListCreateRequest
    );
    console.log(JSON.stringify(apiResponse, null, 2));
    res.status(200).json(apiResponse);
  } catch (e) {
    if (e.message === "HTTP request failed") {
      console.error(JSON.stringify(e.response, null, 2));
      res.status(e.response.status || 500).json(e.response.data || e);
    } else {
      console.error(e);
      res.status(500).json(e);
    }
  }
});

app.post("/createDynamicList", async (req, res) => {
  const listName = "Test Dynamic List";
  const filters = [
    {
      filterType: "PROPERTY",
      property: "firstname",
      operation: {
        operationType: "STRING",
        operator: "IS_EQUAL_TO",
        value: "test",
      },
    },
    {
      filterType: "PROPERTY",
      property: "email",
      operation: {
        operationType: "STRING",
        operator: "CONTAINS",
        value: "test123@gmail.com",
      },
    },
  ];
  const ListCreateRequest = {
    objectTypeId: "0-1",
    processingType: "DYNAMIC",
    name: listName,
    listFolderId: 0,
    filterBranch: {
      filterBranchType: "AND",
      filters: filters,
    },
    filterBranch: {
      filterBranchType: "OR",
      filterBranches: [
        {
          filterBranchType: "AND",
          filters: filters,
        },
      ],
    },
  };

  try {
    const apiResponse = await hubspotClient.crm.lists.listsApi.create(
      ListCreateRequest
    );
    console.log(JSON.stringify(apiResponse, null, 2));
    res.status(200).json(apiResponse);
  } catch (e) {
    if (e.message === "HTTP request failed") {
      console.error(JSON.stringify(e.response, null, 2));
      res.status(e.response.status || 500).json(e.response.data || e);
    } else {
      console.error(e);
      res.status(500).json(e);
    }
  }
});

app.get("/getList", async (req, res) => {
  const listId = "139";
  const includeFilters = false;

  try {
    const apiResponse = await hubspotClient.crm.lists.listsApi.getById(
      listId,
      includeFilters
    );
    console.log(JSON.stringify(apiResponse, null, 2));
    res.status(200).json("done");
  } catch (e) {
    e.message === "HTTP request failed"
      ? console.error(JSON.stringify(e.response, null, 2))
      : console.error(e);
    res.status(500).json(e);
  }
});

app.post("/addToList", async (req, res) => {
  const listId = "139";
  const contactIds = ["6951"];

  try {
    const apiResponse = await hubspotClient.crm.lists.membershipsApi.add(
      listId,
      contactIds
    );
    console.log(JSON.stringify(apiResponse, null, 2));
    res.status(200).json(apiResponse);
  } catch (e) {
    console.error(e);
    res.status(500).json(e);
  }
});

app.listen(3000, () => {
  console.log("server is running on 3000");
});
