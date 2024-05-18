const mongoose = require("mongoose");

mongoose.connect("mongodb+srv://binelbpe:7YMrJIYKKIl6UJ9L@cluster0.pjgwb9i.mongodb.net/4watches?retryWrites=true&w=majority&appName=Cluster0")
.then(()=>{
  console.log('database connected successfully');
}).catch(err=>{
  console.log(err,'some error occured while connecting db');
})

