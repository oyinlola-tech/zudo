/**
 * Email processor.
 *
 * Handles the "send-email" job type.
 * In a real application, this would integrate with an email service.
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class EmailProcessor {
    name = "send-email";
    async process(job, _context) {
        const { to, subject, body, from } = job.data;
        console.log(`[EmailProcessor] Sending email to ${to}`);
        console.log(`  Subject: ${subject}`);
        console.log(`  From: ${from ?? "noreply@example.com"}`);
        // Simulate email sending delay
        await sleep(100);
        console.log(`[EmailProcessor] Email sent successfully to ${to}`);
    }
}
//# sourceMappingURL=email.processor.js.map