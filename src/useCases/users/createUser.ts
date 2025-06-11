import db from "../../db/database"

interface User{
    name: string,
    mail: string,
    password: string,
    username: string,
}

export async function createUser(user: User){

    const {name, mail, password, username} = user

    const isExistMail = await db("users").where({mail:mail})
    if(isExistMail.length != 0){
        return {
            code: 409,
            error: "E-mail já cadastrado"
        }
    }

    try{
        await db("users").insert({
            name,
            mail,
            password,
            username,
            balance: process.env.DEFAULT_START_TOKENS,
            status: 'pending'
        })

        return{
            code: 200,
            error: "Usuário cadastrado com sucesso!"
        }

    }catch(err){
        
        return {
            code: 500,
            error: "Ops! Um erro inesperado aconteceu."
        }

    }
}