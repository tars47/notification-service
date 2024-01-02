# Notification Server

## Using Node.js + Redis

This Project provides Apps to publish notification to all the devices that are
currently using the app.

## APIs

### [POST] Publish Notification

### Web Socket - N number of device connections (N depends on hardware)

## Design Overview

Notification server

App#01 registers to use Notification service
1)Notification server will cerate a redis Topic with id App#01

User Device Turns On
1)I am assuming that one long lived TCP socket(maybe a websocket or xampp implimentation)
will be opened when ever internet is available.
2)Once connection is established Device sends
all the app_ids that are registered for notification service,
we assume this device has sent ["App#01", "App#04", "App#097"]
and we assume that the load balancer has routed this request
to websocket server "ws#87" 3) websocket server "ws#87" will subscribe to redis Topics "App#01", "App#04", "App#097"
if not already subscribed

App#01 publishes a notification message to Notification server
1)Notification server will publish a message on to redis Topic App#01
2)Redis will push the message to all the subscribers of Topic App#01
3)websocket server "ws#87" will receive a message on the redis subscriber connection
4)websocket server "ws#87" will loop through all the tcp sockets currently active
and finds the sockets with "App#01" device id and sends the message to the device
5)device will then display the notification

![Alt text](https://drive.google.com/uc?id=1Hmq8AUYyu8k8LvuLtXr027NLbT3yOrdJ "architecture overview")

## Requirements

For development, you will need Node.js, npm installed in your environment and mongodb free cloud account.

    $ node --version
    v20.10.0.

    $ npm --version
    8.11.0

    $ redis --version
    7.2.3

---

## Install

    $ git clone https://github.com/tars47/notification-service
    $ cd notification-service

## Running the project

    $ npm i
    $ npm run start

## Testing With Postman

1. Create a websocket request and add a unique device_id as shown in the image.
   ![Alt text](https://drive.google.com/uc?id=1JAEtdewglbl6Yt-VCkT0bPoLOY1NUe3K "device_id")

2. Navigate to message tab and paste the below json, here this device is
   trying to subscribe to notifications from apps 001 and 002. Click connect
   and send.

```sh
{
   "type":"subscribe_req",
   "appIds":["App#001","App#002"]
}

```

![Alt text](https://drive.google.com/uc?id=17oSUV3079kC4243R8eJCE6kAZOjRDyp3 "subscribe_req")

3. Now you should see response from the notification server acking the subscribe requests.
   repeat steps 1, 2 and 3 with different device_id and appIds

```sh
{
    "type": "subscribe_res",
    "appIds": [
        {
            "appId": "App#001",
            "message": "already subscribed",
            "code": 200
        },
        {
            "appId": "App#002",
            "message": "already subscribed",
            "code": 200
        }
    ]
}
```

![Alt text](https://drive.google.com/uc?id=1A1a9amQdTCKTW_N1G5BHi9Cagae3ZTWW "subscribe_res")

4. Now paste this curl into new tab, here in this HTTP request App#001 is trying
   to publish a notification.

```sh
curl -L -X POST "localhost:8080/app/notify" -H "Content-Type: application/json" -d "{
    \"app_id\": \"App#001\",
    \"message\": \"this app001 test notification\"
}"
```

![Alt text](https://drive.google.com/uc?id=1K1RHNWr38SZUDrGDqs7eBcmLdn-xuISa "app publish")

5. Now observe all the devices that are subscribed to App#001, they should get
   a notification message from the server.

```sh
{
    "type": "notification",
    "appId": "App#001",
    "message": "this app001 test notification",
    "code": 200
}
```

![Alt text](https://drive.google.com/uc?id=1E1JJ3LM5mD3SrG5BNZuAxLKvap-sGglp "device notified")
