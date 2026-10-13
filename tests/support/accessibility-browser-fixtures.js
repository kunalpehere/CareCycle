import bcrypt from "bcrypt";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { User } from "../../src/models/User.js";
import { Organization } from "../../src/models/Organization.js";
import { Donation } from "../../src/models/Donation.js";
import { DonationRequest } from "../../src/models/DonationRequest.js";
import { saveVerificationDocument } from "../../src/services/verificationDocumentService.js";
import { changeReceipt } from "../../src/services/receiptService.js";

export const seedAccessibilityFixtures = async root => {
    const manifest = {}, password = await bcrypt.hash('Accessibility-fixture-42!', 10);
    const bytes = Buffer.from('%PDF-1.4\nSYNTHETIC_ACCESSIBILITY_EVIDENCE\n%%EOF');
    const document = await saveVerificationDocument({ buffer: bytes, size: bytes.length, mimetype: 'application/pdf', originalname: 'synthetic.pdf' });
    for (const project of ['desktop','mobile']) {
        const users = {};
        for (const [kind,role] of [['donor','donor'],['empty','donor'],['ngo','ngo'],['pending','ngo'],['rejected','ngo'],['new','ngo'],['admin','admin']]) users[kind] = await User.create({ emailVerifiedAt: new Date(), name: `Synthetic ${kind} Accessibility`, email: `${kind}-day18-${project}@example.invalid`, password, role });
        const organizations = {};
        for (const kind of ['ngo','pending','rejected']) organizations[kind] = await Organization.create({ owner: users[kind]._id, name: `Synthetic ${kind} Organization`, contactPerson: 'Synthetic Coordinator', contactEmail: users[kind].email, description: 'Synthetic organization for accessibility verification only', verificationStatus: kind === 'ngo' ? 'verified' : kind,
            verificationDocument: document, registrationNumber: `SYNTHETIC18-${kind}-${project}`, rejectionReason: kind === 'rejected' ? 'Synthetic corrections: provide updated organization evidence.' : '', address: { line1: 'Synthetic Organization Road', city:'Pune',state:'Maharashtra',postalCode:'411001' } });
        await User.collection.updateOne({ _id:users.donor._id },{$set:{products:[{equipment:'Synthetic legacy walker',quality:'unknown'}]}});
        const data = { organizations:Object.fromEntries(Object.entries(organizations).map(([key,item])=>[key,item.id])), requests:{} };
        const start = new Date('2000-01-01T10:00Z'), end = new Date('2000-01-01T12:00Z');
        for (const state of ['available','pending','accepted','disputed','completed','cancelled']) {
            const committed = ['accepted','disputed','completed'].includes(state), handed = ['disputed','completed'].includes(state);
            const listing = await Donation.create({donor:users.donor._id,equipment:state === 'available' ? 'cane':'walker',condition:'good',quantity:state === 'completed' ? 1:5,allocatedQuantity:committed ? state === 'completed' ? 1:2:0,handedOverQuantity:handed ? 1:0,status:state === 'completed' ? 'completed':'available',description:`Synthetic ${state} accessibility listing`,location:{city:`Day18 ${project}`,state:'Maharashtra',postalCode:'411001'}});
            if(state==='available'){data.listing=listing.id;continue;}
            const proposal={start,end,timeZone:'UTC',localStart:'2000-01-01T10:00',localEnd:'2000-01-01T12:00',address:'Synthetic collection address',instructions:'Synthetic coordination text',proposedBy:users.donor._id,proposerRole:'donor'};
            const transfer={declaredQuantity:1,quantity:1,donor:users.donor._id,at:start,status:state==='completed'?'acknowledged':'disputed',receivedQuantity:state==='completed'?1:0,checklist:{equipmentMatches:true,conditionReviewed:true,accessoriesExplained:true},...(state==='completed'?{acknowledgedBy:users.ngo._id,acknowledgedAt:end}:{})};
            const request=await DonationRequest.create({donation:listing._id,organization:organizations.ngo._id,requestedBy:users.ngo._id,quantity:state==='completed'?1:2,status:state==='disputed'?'accepted':state,beneficiary:'Synthetic community summary',message:'Synthetic equipment need for accessibility verification',handedOverQuantity:handed?1:0,acknowledgedQuantity:state==='completed'?1:0,
                fulfillment:handed?{transfers:[transfer],...(state==='completed'?{completedAt:end}:{})}:null,pickup:committed?{status:state==='disputed'?'disputed':state==='completed'?'acknowledged':'confirmed',version:2,proposal,history:[{action:'confirmed',actor:users.ngo._id,actorRole:'ngo',at:start,version:2,proposal}]}:null});
            data.requests[state]=request.id;
            if(state==='completed' && !await changeReceipt({requestId:request._id,version:0,actorId:users.donor._id,actorRole:'donor',action:'issue',body:{}})) throw new Error('Synthetic receipt fixture could not be issued.');
        }
        manifest[project]=data;
    }
    await writeFile(path.join(root,'artifacts/day-18-fixtures.json'),JSON.stringify(manifest));
};
