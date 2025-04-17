const mongoose=require("mongoose");
const {schema}=mongoose;
const addressSchema=new Schema({
    userId: {
      type:Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    address:[{
        addressType:{
            type:String,
            required:true
        },
        name:{
            type:String
        },
        phone: {
            type: String,
            required: [true, "Phone number is required"],
            validate: {
              validator: function (v) {
                return /^\d{10}$/.test(v);
              },
              message: "Invalid phone number format (must be 10 digits)",
            },
            trim: true,
          },

        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        pincode: {
            type: String,
            required: [true, "Pincode is required"],
            validate: {
              validator: function (v) {
                return /^\d{6}$/.test(v);
              },
              message: "Invalid pincode format (must be 6 digits)",
            },
            trim: true,
          },
        
   
    }],
    createdOn: {
        type: Date,
        default: Date.now
    }
});
const Address=mongoose.model("Address",addressSchema);
module.exports=Address;

        

    

