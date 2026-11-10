'use server'
import {adminDatabase} from '@/lib/admin-auth'
import {drainRestockEmails} from '@/lib/restock-server'
import {revalidatePath} from 'next/cache'
export async function processRestockEmails(){
 const {db}=await adminDatabase()
 await drainRestockEmails(db,5)
 revalidatePath('/admin/emails')
}
