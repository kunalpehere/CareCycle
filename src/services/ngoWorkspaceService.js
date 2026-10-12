import { DonationRequest } from '../models/DonationRequest.js';
import { requestAccounting } from './fulfillmentAccounting.js';
import { requestTimeline } from './donorWorkspaceService.js';

export const requestStatuses = ['pending', 'accepted', 'completed', 'rejected', 'cancelled'];
export const positivePage = value => typeof value === 'string' && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;
export const ngoNextAction = (request, userId) => {
    if (request.status === 'pending') return 'Waiting for donor decision';
    if (request.status === 'rejected') return 'Review rejection and current listing availability';
    if (request.status === 'cancelled') return 'Review cancellation history';
    let amounts;
    try { amounts = requestAccounting(request); } catch { return 'Contact support to review older quantity records'; }
    if (!amounts.tracked || request.status === 'completed' && (!amounts.settled || amounts.remaining !== 0 || !request.fulfillment?.completedAt)) return 'Contact support to review older handover evidence';
    if (request.status === 'completed') return amounts.acknowledged > 0 ? 'Review acknowledged handover and receipt' : 'Review completed collection history';
    const disputed = request.fulfillment?.transfers?.find(item => item.status === 'disputed');
    if (disputed) return disputed.resolution ? 'Review donor correction proposal' : 'Waiting for donor discrepancy resolution';
    if (!amounts.settled) return 'Acknowledge handover or report a discrepancy';
    const remainder = request.fulfillment?.remainderProposal;
    if (remainder) return String(remainder.actor) === String(userId) ? 'Waiting for donor release confirmation' : 'Review remaining-unit release proposal';
    if (request.pickup?.missedReport?.disputed || request.pickup?.status === 'missed') return 'Review missed pickup or disagreement';
    if (request.pickup?.status === 'proposed') return String(request.pickup.proposal?.proposedBy) === String(userId) ? 'Waiting for donor pickup confirmation' : 'Confirm donor pickup proposal';
    if (request.pickup?.status === 'confirmed') return 'Review confirmed pickup and collection instructions';
    return amounts.handed > 0 ? 'Arrange remaining pickup' : 'Arrange pickup';
};

export const loadNgoRequests = async ({ organizationId, userId, query = {}, dashboard = false }) => {
    const status = requestStatuses.includes(query.status) ? query.status : '';
    const filter = { organization: organizationId, ...(status ? { status } : dashboard ? { status: { $in: ['accepted', 'pending'] } } : {}) };
    const total = await DonationRequest.countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / 12)), page = Math.min(positivePage(query.page), pages);
    const requests = await DonationRequest.find(filter).sort(dashboard ? { status: 1, createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 }).skip((page - 1) * 12).limit(12)
        .populate({ path: 'donation', select: 'equipment condition quantity allocatedQuantity handedOverQuantity location status donor', populate: { path: 'donor', select: 'name email' } }).lean();
    for (const request of requests) {
        if (['accepted', 'completed'].includes(request.status) && request.donation?.donor) request.donorContact = { name: request.donation.donor.name, email: request.donation.donor.email };
        if (request.donation) delete request.donation.donor;
        request.nextAction = ngoNextAction(request, userId);
        request.timeline = requestTimeline(request);
        try { request.amounts = requestAccounting(request); } catch { request.amounts = null; }
    }
    return { requests, status, total, page, pages };
};
