
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// This is a webhook to receive payment status updates from Arif-Birr.
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // According to Arif-Birr documentation, we should validate the hash.
        const { data, hash } = body;

        if (!data || !hash) {
            console.error("ArifCallback Error: Missing data or hash in request body.");
            return NextResponse.json({ message: "Invalid request payload." }, { status: 400 });
        }

        const arifpayPublicKey = process.env.ARIFPAY_PUBLIC_KEY;
        if (!arifpayPublicKey) {
            console.error("ArifCallback Error: ARIFPAY_PUBLIC_KEY is not set.");
            return NextResponse.json({ message: "Server configuration error." }, { status: 500 });
        }

        const verifier = crypto.createVerify('SHA256');
        verifier.update(JSON.stringify(data));
        const isSignatureValid = verifier.verify(arifpayPublicKey, hash, 'base64');

        if (!isSignatureValid) {
            console.error("ArifCallback Error: Invalid signature.");
            return NextResponse.json({ message: "Invalid signature." }, { status: 403 });
        }

        // The signature is valid, now process the payment data.
        const { sessionId, status } = data;

        if (status === 'SUCCESS') {
            const arifPaymentRecord = await prisma.arifPayment.findUnique({
                where: { sessionId },
                include: { bills: true }
            });

            if (!arifPaymentRecord) {
                return NextResponse.json({ message: "Acknowledged, but no session found." }, { status: 200 });
            }

            // Update the associated bills to 'Paid'.
            await prisma.bill.updateMany({
                where: {
                    id: { in: arifPaymentRecord.bills.map(b => b.id) }
                },
                data: {
                    status: 'Paid',
                    paymentDate: new Date(),
                    paymentReference: `Arifpay: ${sessionId}`,
                    adminVerifiedPayment: true,
                    adminVerificationNotes: "Payment confirmed via Arifpay callback.",
                }
            });
            
             // Update the ArifPayment record itself to confirm processing
            await prisma.arifPayment.update({
                where: { id: arifPaymentRecord.id },
                data: { isProcessed: true }
            });

        } 

        return NextResponse.json({ message: "Callback received successfully." }, { status: 200 });

    } catch (error) {
        console.error("ArifCallback Error: An unexpected error occurred.", error);
        return NextResponse.json({ message: "Internal server error." }, { status: 500 });
    }
}
