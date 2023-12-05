const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express()
const stripe = require("stripe")(process.env.STRIPE_SECRET);
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000

// midleware 

app.use(cors())
app.use(express.json())




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.i4cqwjk.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const verifyJWT = (req, res, next) => {
    const header = req.headers.authorization;

    if (!header) {
        return res.status(401).send('unauthorized user')
    }
    const token = header.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'authorization restricted' })
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {

    try {
        const appointmentOptionsCollection = client.db("doctorsPortal").collection("appointmentOptions")
        const bookingsCollections = client.db("doctorsPortal").collection("bookings")
        const usersCollections = client.db("doctorsPortal").collection("users")
        const doctorsCollections = client.db("doctorsPortal").collection("doctors")

        const verifyAdmin = async (req, res, next) => {
            console.log('inside verify admin ', req.decoded.email);
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail }

            const user = await usersCollections.findOne(query)
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbiden access' })
            }

            else {
                console.log(user.role)
            }
            next();
        }


        app.get('/appointmentOptions', async (req, res) => {
            const date = req.query.date;

            const queary = {}
            const options = await appointmentOptionsCollection.find(queary).toArray();
            const bookingQuery = { bookingDate: date }
            const alreadyBooked = await bookingsCollections.find(bookingQuery).toArray();
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(booked => booked.treatment === option.name)
                const bookingSlot = optionBooked.map(book => book.slot)
                const remainingSlots = option.slots.filter(slot => !bookingSlot.includes(slot))
                // console.log(date, option.name, bookingSlot, remainingSlots.length)
                option.slots = remainingSlots;
            })

            res.send(options)
        })

        app.get('/appointmentSpeciality', async (req, res) => {
            const queary = {}
            const result = await appointmentOptionsCollection.find(queary).project({ name: 1 }).toArray()
            res.send(result);
        })

        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send('unauthorized access')
            }

            const query = { email: email }
            const bookings = await bookingsCollections.find(query).toArray();
            res.send(bookings);
        })

        app.get('/booking/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await bookingsCollections.findOne(query);
            res.send(result);
        })



        app.post('/bookings', async (req, res) => {
            const bookings = req.body;

            const query = {
                bookingDate: bookings.bookingDate,
                treatment: bookings.treatment,
                email: bookings.email
            }

            const bookingCount = await bookingsCollections.find(query).toArray()
            console.log(bookingCount);
            if (bookingCount.length) {
                const message = `you already have booking on date ${bookings.bookingDate}`
                return res.send({ acknowledged: false, message })
            }

            const result = await bookingsCollections.insertOne(bookings);
            res.send(result);
        })

        app.get('/users', async (req, res) => {
            const queary = {}
            const users = await usersCollections.find(queary).toArray();
            res.send(users);
        })

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollections.findOne(query)
            res.send({ isAdmin: user?.role === 'admin' })
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollections.insertOne(user)
            res.send(result);
        })

        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {


            const id = req.params.id;
            console.log(id)
            const options = { upsert: true };
            const queary = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }

            const result = await usersCollections.updateOne(queary, updatedDoc, options)
            res.send(result);
        })




        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            console.log(price)
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: "usd",
                amount: amount,
                "payment_method_types": [
                    "card"
                ],
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });


        })


        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            console.log(email);
            const query = { email: email }
            const user = await usersCollections.findOne(query)

            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '12h' })
                return res.send({ accessToken: token })
            }

            res.status(403).send({ accessToken: '' });
        })

        app.get('/doctors', verifyJWT, async (req, res) => {
            const queary = {}
            const result = await doctorsCollections.find(queary).toArray()
            res.send(result);
        })

        app.post('/doctors', async (req, res) => {
            const doctor = req.body
            const result = await doctorsCollections.insertOne(doctor)
            res.send(result);
        })

        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const result = await doctorsCollections.deleteOne(filter)
            res.send(result)
        })

    }
    finally {

    }

}
run().catch(console.log());






app.get('/', (req, res) => {
    res.send('doctors portel server is running')
})

app.listen(port, () => console.log('server running on port', port))