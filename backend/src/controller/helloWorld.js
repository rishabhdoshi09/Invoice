
module.exports = {
    firstFunction : async(req,res)=>{
        try{
            return res.status(200).send({
                status:200,
                message:"Welcome to Customer Invoicing!!!"
            })

        }catch(error)
        {
            throw error;
        }
    }
}