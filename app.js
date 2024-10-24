const express = require("express");
const app = express();
const cors = require("cors");
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const hubspot = require("@hubspot/api-client");
const cron = require("node-cron");
const hubspotClient = new hubspot.Client({
  accessToken: "",
});
const fs = require("fs");
const path = require("path");
const e = require("express");

function getCurrentDate() {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

function createLogStream() {
  const logDirectory = path.join(__dirname, "logs");
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
  }
  const logFile = path.join(
    logDirectory,
    `hubspot-deal-${getCurrentDate()}.log`
  );
  return fs.createWriteStream(logFile, { flags: "a" });
}

const logStream = createLogStream();

function log(message, level = "info") {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}\n`;
  logStream.write(logMessage);
}

const logger = {
  info: (message) => log(message, "info"),
  error: (message) => log(message, "error"),
  warn: (message) => log(message, "warn"),
};

app.use((req, res, next) => {
  logger.info(`Received ${req.method} request for ${req.url}`);
  next();
});

app.post("/cartData/:contactid/:json", async (req, res) => {
  const contactId = req.params.contactid;
  let mydata = [];
  const date = new Date();
  const fullDate = date.toLocaleDateString("en-GB", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
  const properties = ["cart_data", "email"];
  try {
    const getcontact = await hubspotClient.crm.contacts.basicApi.getById(
      contactId,
      properties
    );
    const cartDetails = getcontact.properties.cart_data;
    if (cartDetails != null && cartDetails != "") {
      const parsedata = JSON.parse(cartDetails);
      for (let i in parsedata) {
        mydata.push(parsedata[i]);
      }
    }
    const newObject = JSON.parse(req.params.json);
    let found = false;
    mydata.forEach((item) => {
      if (
        item.cartObject.productName === newObject.cartObject.productName &&
        item.cartObject.color === newObject.cartObject.color &&
        item.cartObject.gender === newObject.cartObject.gender &&
        item.cartObject.size === newObject.cartObject.size &&
        item.cartObject.price === newObject.cartObject.price
      ) {
        item.cartObject.quantity += newObject.cartObject.quantity;
        found = true;
      }
    });
    if (!found) {
      mydata.push(newObject);
    }
    const SimplePublicObjectInput = {
      properties: { cart_data: JSON.stringify(mydata) },
    };
    await hubspotClient.crm.contacts.basicApi.update(
      contactId,
      SimplePublicObjectInput
    );
    // update deal after add to trip only
    const dealname = getcontact.properties.email + " " + fullDate;
    const PublicObjectSearchRequest = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "dealname",
              value: dealname,
              operator: "EQ",
            },
          ],
        },
      ],
    };
    const getdeal = await hubspotClient.crm.deals.searchApi.doSearch(
      PublicObjectSearchRequest
    );
    if (getdeal.results.length > 0) {
      await updateDeal2(getdeal.results[0].id, newObject);
    }
    logger.info(`Successfully Add Data Into Cart For Contact - ${contactId}`);
    res.status(200).json("done");
  } catch (e) {
    logger.error(`Error At Add To Cart: ${e.body.message}`);
    console.error(e);
  }
});

//get cart data from contact
app.post("/cartData/:contactid", async (req, res) => {
  const contactId = req.params.contactid;
  const properties = ["cart_data"];
  try {
    const apiResponse = await hubspotClient.crm.contacts.basicApi.getById(
      contactId,
      properties
    );
    if (apiResponse) {
      logger.info(`Successfully Get Cart For Contact - ${contactId}`);
      res.status(200).json({ message: "ok", data: apiResponse });
    }
  } catch (e) {
    logger.error(`Error At Get Deal: ${e.body.message}`);
    res.status(500).json(e);
  }
});

//create deal with line items
app.post("/createDeal", async (req, res) => {
  const { email, productData } = req.body;
  const date = new Date();
  const fullDate = date.toLocaleDateString("en-GB", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });

  const dealObject = { properties: { dealname: email + " " + fullDate } };
  try {
    const newdeal = await hubspotClient.crm.deals.basicApi.create(dealObject);
    if (productData.length) {
      for (let i in productData) {
        const properties = {
          name: productData[i].productName,
          merchandise_color: productData[i].color,
          gender: productData[i].gender,
          merchandise_size: productData[i].size,
          price: productData[i].price,
          quantity: productData[i].quantity,
        };
        const object = {
          associations: [
            {
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 20,
                },
              ],
              to: { id: newdeal.id },
            },
          ],
          properties,
        };
        const lineitemdata = await hubspotClient.crm.lineItems.basicApi.create(
          object
        );
        logger.info(`Successfully Create Line Items - ${lineitemdata.id}`);
      }
    }
    logger.info(`Successfully Create Deal - ${newdeal.id}`);
    res.status(200).json({ message: "ok", data: newdeal });
  } catch (e) {
    logger.error(`Error At Get Deal: ${e.body.message}`);
    res.status(500).json(e);
  }
});

//get deal data(deal created or not)
app.post("/getDeal", async (req, res) => {
  try {
    const contactId = req.body.contactId;
    const date = new Date();
    const fullDate = date.toLocaleDateString("en-GB", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    });

    const contactdata = await hubspotClient.crm.contacts.basicApi.getById(
      contactId
    );
    const dealname = contactdata.properties.email + " " + fullDate;
    const PublicObjectSearchRequest = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "dealname",
              value: dealname,
              operator: "EQ",
            },
          ],
        },
      ],
    };
    const apiResponse = await hubspotClient.crm.deals.searchApi.doSearch(
      PublicObjectSearchRequest
    );
    if (apiResponse.results.length > 0) {
      const dealdata = apiResponse.results[0];
      res.status(200).json({ message: "ok", data: dealdata });
      logger.info(`Successfully get Deal Data For Contact - ${contactId} `);
    } else {
      logger.info(`Successfully get null Data for Contact - ${contactId}`);
      res.status(200).json({ message: "ok", data: null });
    }
  } catch (e) {
    console.log(e);
    logger.error(`Error At get Deal : ${e.body.message}`);
  }
});

//update deal if current day and add to cart
const updateDeal2 = async (dealId, productData) => {
  try {
    const associations = ["line_items"];
    const properties = ["cart_data", "email"];
    const archived = false;
    const idProperty = undefined;
    const propertiesWithHistory = undefined;
    let iscreated = false;
    let updateitemid = "";
    let oldquantity = "";
    const apiResponse = await hubspotClient.crm.deals.basicApi.getById(
      dealId,
      properties,
      propertiesWithHistory,
      associations,
      archived,
      idProperty
    );
    if (apiResponse && apiResponse.associations) {
      const line_items = apiResponse.associations["line items"].results;

      for (let i in line_items) {
        //find line item
        const lineItemId = line_items[i].id;
        const properties = [
          "price",
          "quantity",
          "gender",
          "merchandise_size",
          "merchandise_color",
          "name",
        ];
        const propertiesWithHistory = undefined;
        const associations = undefined;
        const archived = false;
        const idProperty = undefined;
        const lineitemdata = await hubspotClient.crm.lineItems.basicApi.getById(
          lineItemId,
          properties,
          propertiesWithHistory,
          associations,
          archived,
          idProperty
        );
        if (
          lineitemdata.properties.name == productData.cartObject.productName &&
          lineitemdata.properties.merchandise_color ==
            productData.cartObject.color &&
          lineitemdata.properties.gender == productData.cartObject.gender &&
          lineitemdata.properties.merchandise_size ==
            productData.cartObject.size &&
          lineitemdata.properties.price == productData.cartObject.price
        ) {
          iscreated = true;
          updateitemid = lineitemdata.id;
          oldquantity = lineitemdata.properties.quantity;
        }
      }
    }

    if (iscreated) {
      const lineItemId = updateitemid;
      const properties = {
        name: productData.cartObject.productName,
        hs_line_item_color: productData.cartObject.color,
        hs_line_item_gender: productData.cartObject.gender,
        hs_line_item_size: productData.cartObject.size,
        price: productData.cartObject.price,
        quantity: Number(productData.cartObject.quantity) + Number(oldquantity),
      };
      const SimplePublicObjectInput = { properties };
      await hubspotClient.crm.lineItems.basicApi.update(
        lineItemId,
        SimplePublicObjectInput
      );
    } else {
      const properties = {
        name: productData.cartObject.productName,
        merchandise_color: productData.cartObject.color,
        gender: productData.cartObject.gender,
        merchandise_size: productData.cartObject.size,
        price: productData.cartObject.price,
        quantity: productData.cartObject.quantity,
      };

      const SimplePublicObjectInputForCreate2 = {
        associations: [
          {
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: 20,
              },
            ],
            to: { id: dealId },
          },
        ],
        properties,
      };
      await hubspotClient.crm.lineItems.basicApi.create(
        SimplePublicObjectInputForCreate2
      );
      logger.info(`Successfully Add Line Items For Deal - ${dealId}`);
    }
  } catch (e) {
    logger.error(`Error At Add Line Items : ${e.body.message}`);
    return e;
  }
};

// remove cart items and update contact cart data
app.post("/removeCartItem", async (req, res) => {
  const contactId = req.body.contactId;
  const index = req.body.index;
  const properties = ["cart_data", "email"];
  let updateitemid = "";
  let isdeleted = "";
  const date = new Date();
  try {
    const fullDate = date.toLocaleDateString("en-GB", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    });

    const getcontact = await hubspotClient.crm.contacts.basicApi.getById(
      contactId,
      properties
    );

    const cart_data = JSON.parse(getcontact.properties.cart_data)[index];
    const olddata = JSON.parse(getcontact.properties.cart_data);
    olddata.length && olddata.splice(index, 1);
    const dealname = getcontact.properties.email + " " + fullDate;
    const PublicObjectSearchRequest = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "dealname",
              value: dealname,
              operator: "EQ",
            },
          ],
        },
      ],
    };
    const getdeal = await hubspotClient.crm.deals.searchApi.doSearch(
      PublicObjectSearchRequest
    );
    const dealId = getdeal.results[0].id;
    if (getdeal.results.length > 0) {
      const associations = ["line_items"];
      const properties = ["cart_data", "email"];
      const archived = false;
      const idProperty = undefined;
      const propertiesWithHistory = undefined;
      const apiResponse = await hubspotClient.crm.deals.basicApi.getById(
        dealId,
        properties,
        propertiesWithHistory,
        associations,
        archived,
        idProperty
      );
      const line_items = apiResponse.associations["line items"].results;
      if (line_items.length) {
        for (let i in line_items) {
          //find line item
          const lineItemId = line_items[i].id;
          const properties = [
            "price",
            "quantity",
            "gender",
            "merchandise_size",
            "merchandise_color",
            "name",
          ];
          const propertiesWithHistory = undefined;
          const associations = undefined;
          const archived = false;
          const idProperty = undefined;
          const lineitemdata =
            await hubspotClient.crm.lineItems.basicApi.getById(
              lineItemId,
              properties,
              propertiesWithHistory,
              associations,
              archived,
              idProperty
            );
          if (
            lineitemdata.properties.name == cart_data.cartObject.productName &&
            lineitemdata.properties.merchandise_color ==
              cart_data.cartObject.color &&
            lineitemdata.properties.gender == cart_data.cartObject.gender &&
            lineitemdata.properties.merchandise_size ==
              cart_data.cartObject.size &&
            lineitemdata.properties.price == cart_data.cartObject.price
          ) {
            isdeleted = true;
            updateitemid = lineitemdata.id;
          }
        }
        if (isdeleted) {
          await hubspotClient.crm.lineItems.basicApi.archive(updateitemid);
        }
      }
    }
    const SimplePublicObjectInput = {
      properties: { cart_data: JSON.stringify(olddata) },
    };
    const updatecon = await hubspotClient.crm.contacts.basicApi.update(
      contactId,
      SimplePublicObjectInput
    );
    logger.info(`Successfully Remove Line Items For Contact - ${contactId}`);

    res.status(200).json("ok");
  } catch (e) {
    logger.error(`Error At Remove Cart Item: ${e.body.message}`);
    res.status(500).json(e);
  }
});

// ------------------------------------------------------- remove cart data at every night --------------------------------------------------------------
const removecartData = async (after, limit) => {
  try {
    let inputs = [];
    const apiResponse = await hubspotClient.crm.contacts.basicApi.getPage(
      limit,
      after
    );
    for (let i in apiResponse.results) {
      const obj = {
        id: apiResponse.results[i].id,
        properties: { cart_data: "" },
      };
      inputs.push(obj);
    }
    const myobject = { inputs };
    const updatecontact = await hubspotClient.crm.contacts.batchApi.update(
      myobject
    );
    if (apiResponse.paging) {
      let after = apiResponse.paging.next.after;
      let limit = 100;
      await againcall(after, limit);
    }
  } catch (e) {
    e.message === "HTTP request failed"
      ? console.error(JSON.stringify(e.response, null, 2))
      : console.error(e);
  }
};
const againcall = async (after, limit) => {
  const apiResponse = await hubspotClient.crm.contacts.basicApi.getPage(
    limit,
    after
  );
  if (apiResponse.paging) {
    const after = apiResponse.paging.next.after;
    const limit = 100;
    removecartData(after, limit);
  }
};

cron.schedule("0 0 * * *", () => {
  logger.info(`Remove Cart Data from Contacts at 12pm`);
  console.log("Running a task every day at midnight");
  removecartData(0, 100);
});

app.get("/", (req, res) => {
  res.send("hey");
});

app.listen(3300, () => {
  console.log("server is running on 3300");
});
