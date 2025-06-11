import db from "../../db/database"

interface User{
    id: string,
    name: string,
    mail: string,
    password: string,
    username: string,
}

export async function editUser(user: User){

    const {id, name, mail, password, username} = user

    try{
        await db("users").update({
            name,
            mail,
            password,
            username,
        }).where({id})

        return{
            code: 200,
            error: "Usuário atualizado com sucesso!"
        }

    }catch(err){
        console.error(err)
        return {
            code: 500,
            error: "Ops! Um erro inesperado aconteceu."
        }

    }
}