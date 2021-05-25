const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    order:{
        type:[String],
        required: true
    }
});

const menuSchema = new mongoose.Schema({
    pizza:{
        type: String,
        required: true
    }
});

const Order = mongoose.model("order", orderSchema);
const Menu = mongoose.model("menu", menuSchema);


module.exports = {
    Order: Order,
    Menu: Menu
};