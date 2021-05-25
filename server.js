const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const mongoose = require("mongoose");
const path = require('path');

dotenv.config();

const app = express();
const port = 8000;
const dbUrl = process.env.MONGO_URL;
const ObjectID = require("mongodb").ObjectID
const models = require('./models');

const Order = models.Order;
const Menu = models.Menu;

app.set('view engine', 'pug');
app.use("/", express.static("public"));
app.use(bodyParser.json());
app.use(bodyParser.text());


async function get_pizza_order_by_id(order_id){
    let status_code, message, object;

    if (! ObjectID.isValid(order_id)){
        status_code = 400;
        message = "Invalid ID."
        object = null;
        return [status_code, object, message];
    }

    const order = await Order.findById(order_id);

    if(!order){
        status_code = 404;
        message = `Order with id ${order_id} does not exist.`
        object = null;
        return [status_code, object, message];
    }

    status_code = 200;
    message = null;

    return [status_code, order, message];
}

async function validate_new_order(order, menu){
    let status_code;
    let message;

    if(typeof order == "undefined"){
        status_code = 400;
        message = `Invalid json. Should contain 'order' key with string value of order.`;
        order = null;
        return [status_code, order, message];
    }

    order = order.replace(/ /g,'');
    order = order.split(',');

    let is_order_match_menu = order.every(function(val) {
        return menu.indexOf(val) >= 0;
    });

    if (!is_order_match_menu){
        status_code = 400;
        message = `Some pizza in order doesnt match with current menu`;
        order = null;
        return [status_code, order, message];
    }

    status_code = 200;
    message = null;
    return [status_code, order, message];
}


async function get_menu() {
    let menu = await Menu.find({}).lean();
    menu = menu.map(doc => doc.pizza);
    return menu;
}


app.route("/menu")
    .get(async (request, response) => {
        const menu = await Menu.find({}).lean();

        response.status(200).json(menu);
    })
    .delete(async (request, response) => {
        const menu_pizza_id = request.body.item_id;

        if (! ObjectID.isValid(menu_pizza_id)){
            response.status(400);
            return response.send("Invalid ID");
        }

        try {
            const deleted_order = await Menu.findByIdAndDelete(menu_pizza_id);

            if (deleted_order){
                response.status(200);
                return response.send((`Menu position ${menu_pizza_id}: (${deleted_order.pizza}) deleted`));
            }

            response.status(404);
            return response.send((`Menu position with id: ${menu_pizza_id}: does not exists`));

        } catch (error) {
            console.log(error);
            response.status(500);
            return response.send(`Some error occurred while deleting`);
        }

    })
    .post(async (request, response) => {
        let menu = await get_menu();

        let new_item_name = request.body.item;

        if (!new_item_name) {
            response.status(400);
            return response.send(`Invalid data`);
        }

        if (menu.includes(new_item_name)){
            return response.send(`Item (${new_item_name}) already present in menu`);
        } else {
            new_item_name = new_item_name.trim();
            const new_item = {pizza: new_item_name}
            try {
                const new_document = await Menu.create(new_item);
                return response.send(`Item ${new_item_name} with id ${new_document.id} created`);
            } catch (error) {
                console.log(error);
                response.status(500);
                return response.send(`Some error occurred while creating item`);
            }
        }



    });

app.route("/pizza")
    .get(async (request, response) => {
        try{
            const res = await Order.find({}).lean();

            return response.send(res);
        } catch (error) {
            console.log(error);
            response.status(500);
            return response.send(`Some error occurred while retrieving orders`);
        }
    })
    .post(async (request, response) => {
        const body = request.body;

        let menu = await get_menu();

        let [status_code, order, message] = await validate_new_order(body.order, menu);

        response.status(status_code);
        if (!order){
            return response.send(message);
        }

        const new_order = {"order": order};

        try {
            const new_document = await Order.create(new_order);
            return response.send(`Order with id ${new_document.id} was created`);
        } catch (error) {
            console.log(error);
            response.status(500);
            return response.send(`Some error occurred while creating order`);
        }
    });

app.route("/pizza/:id")
    .get(async (request, response) => {
        let status_code, document, message;
        try {
            [status_code, document, message] = await get_pizza_order_by_id(request.params.id);
        } catch (error) {
            console.log(error);
            response.status(500);
            return response.send(`Some error occurred while retrieving order`);
        }

        response.status(status_code);
        if (document){
            response.send(document.order.toString());
        } else {
            response.send(message);
        }

    })
    .delete(async (request, response) => {
        const order_id = request.params.id;

        if (! ObjectID.isValid(order_id)){
            response.status(400);
            return response.send("Invalid ID");
        }

        try {
            const deleted_order = await Order.findByIdAndDelete(order_id);

            if (deleted_order){
                response.status(200);
                return response.send((`Order ${order_id}: (${deleted_order.order}) deleted`));
            }

            response.status(404);
            return response.send((`Order ${order_id} does not exists`));

        } catch (error) {
            console.log(error);
            response.status(500);
            return response.send(`Some error occurred while deleting order`);
        }

    })
    .patch(async (request, response) => {
        const body = request.body;

        let new_status_code, new_message, status_code, order, message;
        let order_id = request.params.id;
        let new_order = body.new_order;
        let menu = await get_menu();

        try {
            [status_code, order, message] = await get_pizza_order_by_id(order_id);

            if (!order){
                response.status(status_code);
                return response.send(message);
            }
        } catch (error) {
            console.log(error);
            response.status(500);
            return response.send(`Some error occurred while retrieving order`);
        }

        [new_status_code, new_order, new_message] = await validate_new_order(new_order, menu);
        if (!new_order){
            response.status(new_status_code);
            return response.send(new_message);
        }

        try{
            const updated_order = await Order.findByIdAndUpdate(order_id, {order: new_order}, {new: true}).lean();

            return response.send(`Order ${order_id}: ${order.order} changed to ${updated_order.order}`);
        } catch (error) {
            console.log(error);
            response.status(500);
            return response.send(`Some error occurred while retrieving order`);
        }

    });

app.listen(port, async () => {
    console.log('Server start');
    await mongoose.connect(dbUrl, {useNewUrlParser: true});
});

app.route("/admin")
    .get(async (request, response) => {
        response.sendFile(path.join(__dirname, 'public/admin.html'));
    });