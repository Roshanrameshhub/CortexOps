# Incident Communication Templates

**Version**: 1.0.0
**Last Updated**: 2025-11-19
**Owner**: DevOps & Customer Success Teams

---

## Table of Contents

1. [Internal Communications](#internal-communications)
2. [External Communications](#external-communications)
3. [Status Page Updates](#status-page-updates)
4. [Email Templates](#email-templates)
5. [Social Media](#social-media)

---

## Internal Communications

### Incident Declaration (Slack)

#### P0 - Critical

```
🚨🚨🚨 P0 INCIDENT DECLARED 🚨🚨🚨

Service: [Service Name]
Severity: P0 - CRITICAL
Impact: [Brief description of user impact]
Affected: [% of users / "All users" / specific segment]
Started: [HH:MM UTC]

Status: Investigating
IC: @[incident-commander]
War Room: #incident-YYYY-MM-DD-NNN

@engineering-leadership @on-call-team

Next update: 15 minutes
```

#### P1 - High

```
🔴 P1 INCIDENT DECLARED

Service: [Service Name]
Severity: P1 - High
Impact: [Brief description]
Affected: [% of users]
Started: [HH:MM UTC]

Status: Investigating
IC: @[incident-commander]
War Room: #incident-YYYY-MM-DD-NNN

Next update: 30 minutes
```

#### P2 - Medium

```
🟡 P2 INCIDENT

Service: [Service Name]
Severity: P2 - Medium
Impact: [Brief description]
Affected: [% of users]

Status: Investigating
IC: @[incident-commander]
War Room: #incident-YYYY-MM-DD-NNN

Next update: 2 hours
```

---

### Incident Updates (Slack)

#### Investigating

```
📊 INCIDENT UPDATE - [Incident ID]

Time: [HH:MM UTC]
Status: Investigating 🔍

Current Situation:
[1-2 sentence update on what's happening]

What We're Doing:
[1-2 sentence on actions being taken]

Next Steps:
[What we'll do next]

Next update: [timeframe]
```

#### Root Cause Identified

```
📊 INCIDENT UPDATE - [Incident ID]

Time: [HH:MM UTC]
Status: Root Cause Identified ✓

Root Cause:
[Brief explanation of what went wrong]

Resolution Plan:
[What we're doing to fix it]

ETA: [estimated time to resolution]

Next update: [timeframe]
```

#### Monitoring

```
📊 INCIDENT UPDATE - [Incident ID]

Time: [HH:MM UTC]
Status: Monitoring 👀

Fix Deployed:
[What was fixed]

Current Status:
[Metrics showing improvement]

Monitoring:
We're watching the system for [duration] to ensure stability.

Next update: [timeframe]
```

#### Resolved

```
✅ INCIDENT RESOLVED - [Incident ID]

Time: [HH:MM UTC]
Duration: [X hours Y minutes]

Resolution:
[What was done to fix the issue]

Root Cause:
[Brief explanation]

Impact Summary:
- Duration: [time]
- Users affected: [number/percentage]
- Functionality: [what was impacted]

Follow-Up:
Post-incident review scheduled for [date/time]
Action items will be tracked in [location]

Thank you to everyone involved:
@person1 @person2 @person3
```

---

## External Communications

### Customer Notification - Initial

#### Email Subject
```
[LLM Marketplace] Service Issue Notification - [Service Name]
```

#### Email Body - P0/P1
```
Dear LLM Marketplace Customer,

We are currently experiencing issues with [service name] that may affect
your ability to [describe functionality].

Status: Investigating
Started: [date/time]
Affected: [description of what's impacted]

Our engineering team is actively working to resolve this issue. We will
provide updates every [30 minutes for P0, 1 hour for P1].

For real-time updates, please visit our status page:
https://status.llm-marketplace.com

We apologize for any inconvenience and will update you soon.

Best regards,
LLM Marketplace Operations Team

---
For urgent support: support@llm-marketplace.com
Status page: https://status.llm-marketplace.com
```

---

### Customer Notification - Resolution

#### Email Subject
```
[Resolved] LLM Marketplace Service Issue - [Service Name]
```

#### Email Body
```
Dear LLM Marketplace Customer,

The service issue affecting [service name] has been resolved.

Issue Duration: [start time] - [end time] ([duration])
Impact: [brief description]
Root Cause: [brief, customer-friendly explanation]

Resolution:
[What we did to fix it]

Current Status:
All systems are operating normally. We are continuing to monitor for
stability.

What We're Doing to Prevent This:
[Brief mention of improvements]

We sincerely apologize for the disruption to your service.

If you have any questions or concerns, please don't hesitate to contact
our support team.

Best regards,
LLM Marketplace Operations Team

---
For support: support@llm-marketplace.com
Status page: https://status.llm-marketplace.com
```

---

## Status Page Updates

### Investigating

```
Investigating - [Service Name] Issues

Posted: [timestamp]

We are investigating reports of [description of issue] affecting
[service/feature name].

[If known] Users may experience [specific symptoms].

Our engineering team is actively investigating. Updates will be posted
here as we learn more.

Next update: [time]
```

### Identified

```
Identified - [Service Name] Issues

Posted: [timestamp]

We have identified the cause of the issue affecting [service/feature name].

Issue: [Brief, non-technical explanation]

Our team is implementing a fix. We expect service to be restored within
[timeframe].

Next update: [time]
```

### Monitoring

```
Monitoring - [Service Name] Issues

Posted: [timestamp]

We have implemented a fix for the issue affecting [service/feature name].

Early indicators show [positive metric]. We are monitoring the service
closely to ensure stability.

Next update: [time] or when we can confirm full resolution
```

### Resolved

```
Resolved - [Service Name] Issues

Posted: [timestamp]

This incident has been resolved. All services are operating normally.

Summary:
- Duration: [duration]
- Impact: [what was affected]
- Resolution: [what we did]

We apologize for the inconvenience. A detailed post-mortem will be
published within [timeframe].

Thank you for your patience.
```

### Post-Mortem Published

```
Post-Mortem Available - [Service Name] Incident

Posted: [timestamp]

We have published a detailed post-mortem for the [date] incident affecting
[service/feature name].

The post-mortem includes:
- Detailed timeline
- Root cause analysis
- Steps taken to prevent recurrence

Read the full post-mortem: [link]

We remain committed to providing reliable service and appreciate your
continued trust.
```

---

## Email Templates

### Enterprise Customer - Critical Incident

```
Subject: URGENT: LLM Marketplace Service Disruption

Dear [Customer Name],

I'm reaching out personally regarding a critical service issue currently
affecting LLM Marketplace.

Situation:
[Service name] is currently experiencing [issue description]. This is
impacting [specific functionality].

Impact to Your Organization:
[Specific impact based on customer's usage]

Current Status:
Our engineering team is actively working on resolution. Current ETA is
[timeframe].

What We're Doing:
[Brief explanation of resolution efforts]

Your Account Manager:
[Name] is available at [phone] and [email] for any questions or concerns.

We will continue to update you every [timeframe] until resolved.

I sincerely apologize for this disruption.

Best regards,
[Executive Name]
[Title]
LLM Marketplace

Direct: [phone]
Email: [email]
```

---

### Partner/Integration Notification

```
Subject: API Service Alert - LLM Marketplace

Dear Integration Partner,

This is a notification regarding an ongoing issue with the LLM Marketplace
API that may affect your integration.

Service: [API/Service name]
Status: [Current status]
Affected Endpoints:
- [endpoint 1]
- [endpoint 2]

Expected Behavior:
Your application may experience [specific errors/behaviors].

Recommended Action:
[Any steps they should take, or "No action needed on your part"]

We are actively working on a resolution. Updates are available at:
https://status.llm-marketplace.com

For technical questions regarding your integration:
Technical Support: api-support@llm-marketplace.com
Your Partner Manager: [name/email]

Best regards,
LLM Marketplace API Team
```

---

## Social Media

### Twitter/X - Incident Notification

```
We're aware of an issue affecting [feature/service]. Our team is
investigating. Status updates: https://status.llm-marketplace.com
#ServiceUpdate
```

### Twitter/X - Resolution

```
✅ Resolved: The issue affecting [feature/service] has been fixed.
All systems operational. Thanks for your patience.
Full details: https://status.llm-marketplace.com
```

### LinkedIn - Post-Mortem (If Major)

```
Transparency Update: [Service] Incident Post-Mortem

On [date], we experienced a [duration] outage affecting [service].

What happened:
[Brief, honest explanation]

What we learned:
[Key insights]

What we're doing:
[Improvements being made]

Our commitment to reliability means being transparent when things go wrong
and learning from every incident.

Read full post-mortem: [link]

#Transparency #ServiceReliability
```

---

## Best Practices

### DO ✅

- **Be Transparent**: Honest about impact and timeline
- **Be Specific**: Use concrete metrics when possible
- **Be Timely**: Update at committed intervals
- **Be Empathetic**: Acknowledge customer frustration
- **Be Professional**: Clear, concise language
- **Be Proactive**: Update before customers ask

### DON'T ❌

- **Don't Speculate**: Only share confirmed information
- **Don't Blame**: Avoid blaming individuals/teams publicly
- **Don't Minimize**: Don't downplay customer impact
- **Don't Ghost**: Never miss promised update time
- **Don't Over-Technical**: Use customer-friendly language
- **Don't Promise**: Avoid guarantees unless certain

---

## Communication Checklist

### Before Sending External Communication

- [ ] Severity confirmed (using correct template for severity)
- [ ] Impact statement accurate (not speculation)
- [ ] Technical jargon removed or explained
- [ ] Tone appropriate (apologetic for P0/P1)
- [ ] Next update time specified
- [ ] Links working (status page, support)
- [ ] Reviewed by second person (for P0/P1)
- [ ] Legal/PR review (if data breach or major outage)
- [ ] Distribution list correct
- [ ] Incident ID referenced (for tracking)

---

## Escalation Matrix

### When to Notify

| Severity | Internal Notify | Customer Notify | Executive Notify |
|----------|----------------|-----------------|------------------|
| P0 | Immediately | Within 5 min | Immediately |
| P1 | Immediately | Within 15 min | Within 30 min |
| P2 | Within 15 min | Within 1 hour | If escalated |
| P3 | Within 1 hour | Only if requested | No |

### Communication Channels by Severity

**P0**:
- Status page (public)
- Email (all customers)
- Phone call (enterprise customers)
- Social media (if public visibility)
- Internal all-hands notification

**P1**:
- Status page (public)
- Email (affected customers)
- Enterprise customer notification
- Internal engineering notification

**P2**:
- Status page (if customer-facing)
- Email (on request)
- Internal team notification

**P3**:
- Internal notification only
- No external communication (unless requested)

---

**Document Version**: 1.0.0
**Last Review**: 2024-11-19
**Next Review**: 2024-12-19
**Owner**: Customer Success & DevOps
