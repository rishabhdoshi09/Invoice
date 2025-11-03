const Router = require("express").Router();
const Controller = require("../controller");

Router.post("/", Controller.customer.createCustomer);
Router.get("/", Controller.customer.listCustomers);
Router.get("/:customerId", Controller.customer.getCustomer);
Router.put("/:customerId", Controller.customer.updateCustomer);
Router.delete("/:customerId", Controller.customer.deleteCustomer);

module.exports = Router;
