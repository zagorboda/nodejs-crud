const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const util = require('util');
const MongoClient = require('mongodb').MongoClient;
const ObjectId = require("mongodb").ObjectId;
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = 8000;
const dbUrl = process.env.MONGO_URL;

const readFile = util.promisify(fs.readFile);

app.set('view engine', 'pug');
app.use("/", express.static("public"));
app.use(bodyParser.json());
app.use(bodyParser.text());


async function get_pizza_order_by_id(db, order_id){
    let status_code;
    let message;
    let object;

    if(typeof order_id == "undefined"){
        status_code = 400;
        message = "Invalid json. Should contain id key."
        object = null;
        return [status_code, object, message];
    }

    if (!order_id){
        status_code = 400;
        message = "Invalid data. ID must be positive integer."
        object = null;
        return [status_code, object, message];
    }

    const order = await app.locals.db.findOne({_id: ObjectId(order_id)});

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

function validate_new_order(order, menu){
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
    return new Promise(function(resolve, reject) {
        const collection = app.locals.menu;

        collection.find({}).toArray(function (err, items) {
            if (err) {
                reject(err);
            } else {
                let menu = [];
                for (const pizza of items) {
                    menu.push(pizza.name);
                }
                resolve(menu);
            }
        });
    });
}


app.route("/get_menu")
    .get(async (request, response) => {
        const menu = await get_menu();
        response.status(200).json(menu);
    })

app.route("/pizza")
    .get(async (request, response) => {
        const orders = await app.locals.db.find({}).toArray();

        response.send(orders);
    })
    .post(async (request, response) => {
        const body = request.body;

        let menu = await get_menu();

        let [status_code, order, message] = validate_new_order(body.order, menu);

        response.status(status_code);
        if (!order){
            return response.send(message);
        }

        const new_order = {"order": order}

        app.locals.db.insertOne(new_order, function (err, res) {
            if (err) throw err;
            return response.send(`Create order ${res.ops[0]._id}`);
        })

    });



app.route("/pizza/:id")
    .get(async (request, response) => {
        let [status_code, document, message] = await get_pizza_order_by_id(app.locals.db, request.params.id);

        response.status(status_code);
        if (document){
            response.send(document.order.toString());
        } else {
            response.send(message);
        }

    })
    .delete(async (request, response) => {
        const db = app.locals.db
        const order_id = request.params.id;

        const deleted_order = await db.findOneAndDelete( { "_id" : ObjectId(order_id) } );

        if (deleted_order.value){
            response.status(200);
            return response.send((`Order ${order_id}: (${deleted_order.value.order}) deleted`));
        }
        response.status(404);
        return response.send((`Order ${order_id} does not exists`));


    })
    .patch(async (request, response) => {
        const body = request.body;

        let new_status_code, new_message;
        let order_id = request.params.id;
        let new_order = body.new_order;

        let menu = await get_menu();

        let [status_code, order, message] = await get_pizza_order_by_id(app.locals.db, order_id);
        if (!order){
            response.status(status_code);
            return response.send(message);
        }

        [new_status_code, new_order, new_message] = await validate_new_order(new_order, menu);
        if (!new_order){
            response.status(new_status_code);
            return response.send(new_message);
        }

        const new_order_values = {$set: {order:  new_order}};
        app.locals.db.updateOne(order, new_order_values);
        response.send(`Object ${order_id}: (${order.order}) was updated to (${new_order})`);

    });

app.listen(port, async () => {
    console.log('Server start');
    await MongoClient.connect(dbUrl, async (err, client) => {
        if (err) console.log(err);

        console.log("Connect to db");
        app.locals.db = await client.db('pizza').collection('orders');
        app.locals.menu = await client.db('pizza').collection('menu');

        process.on('SIGINT', () => {
            console.log("Disconnect db");
            client.close();
            process.exit();
        });
    });
});