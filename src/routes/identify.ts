import { Router } from 'express';
import prisma from '../prismaClient';

const router = Router();

interface IdentifyReq {
  email?: string | null;
  phoneNumber?: string | null;
}

const normalize = (v?: string | null) =>
  v === null || v === undefined ? undefined : String(v).trim();

router.post('/', async (req, res) => {
  try {
    const body: IdentifyReq = req.body;
    const email = normalize(body.email);
    const phoneNumber = normalize(body.phoneNumber);

    if (!email && !phoneNumber)
      return res
        .status(400)
        .json({ error: 'At least one of email or phoneNumber must be provided' });

    const initialMatches = await prisma.contact.findMany({
      where: {
        OR: [
          email ? { email } : undefined,
          phoneNumber ? { phoneNumber } : undefined,
        ].filter(Boolean) as any,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (initialMatches.length === 0) {
      const created = await prisma.contact.create({
        data: { email, phoneNumber, linkPrecedence: 'primary' },
      });

      return res.json({
        contact: {
          primaryContatctId: created.id,
          emails: created.email ? [created.email] : [],
          phoneNumbers: created.phoneNumber ? [created.phoneNumber] : [],
          secondaryContactIds: [],
        },
      });
    }

    const foundIds = new Set<number>(initialMatches.map((c) => c.id));
    let frontier = initialMatches.slice();

    while (frontier.length > 0) {
      const emails = frontier.map((c) => c.email).filter(Boolean) as string[];
      const phones = frontier.map((c) => c.phoneNumber).filter(Boolean) as string[];

      const more = await prisma.contact.findMany({
        where: {
          OR: [
            emails.length > 0 ? { email: { in: emails } } : undefined,
            phones.length > 0 ? { phoneNumber: { in: phones } } : undefined,
          ].filter(Boolean) as any,
        },
      });

      const newOnes = more.filter((c) => !foundIds.has(c.id));
      newOnes.forEach((c) => foundIds.add(c.id));
      frontier = newOnes;
    }

    const allContacts = await prisma.contact.findMany({
      where: { id: { in: Array.from(foundIds) } },
      orderBy: { createdAt: 'asc' },
    });

    let primary =
      allContacts.find((c) => c.linkPrecedence === 'primary') ?? allContacts[0];

    const primaries = allContacts.filter((c) => c.linkPrecedence === 'primary');
    if (primaries.length > 1) {
      primaries.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );
      primary = primaries[0];
      const others = primaries.slice(1);
      for (const o of others) {
        await prisma.contact.update({
          where: { id: o.id },
          data: { linkPrecedence: 'secondary', linkedId: primary.id },
        });
      }
    }

    const nonPrimary = allContacts.filter((c) => c.id !== primary.id);
    for (const c of nonPrimary) {
      if (c.linkPrecedence !== 'secondary' || c.linkedId !== primary.id) {
        await prisma.contact.update({
          where: { id: c.id },
          data: { linkPrecedence: 'secondary', linkedId: primary.id },
        });
      }
    }

    const emailsInGroup = Array.from(
      new Set(allContacts.map((c) => c.email).filter(Boolean) as string[])
    );
    const phonesInGroup = Array.from(
      new Set(allContacts.map((c) => c.phoneNumber).filter(Boolean) as string[])
    );

    let createdSecondary = null;
    const newEmail = email && !emailsInGroup.includes(email);
    const newPhone = phoneNumber && !phonesInGroup.includes(phoneNumber);

    if (newEmail || newPhone) {
      createdSecondary = await prisma.contact.create({
        data: {
          email: newEmail ? email : undefined,
          phoneNumber: newPhone ? phoneNumber : undefined,
          linkPrecedence: 'secondary',
          linkedId: primary.id,
        },
      });
      allContacts.push(createdSecondary);
    }

    const uniqueEmails = Array.from(
      new Set(allContacts.map((c) => c.email).filter(Boolean) as string[])
    );
    const uniquePhones = Array.from(
      new Set(allContacts.map((c) => c.phoneNumber).filter(Boolean) as string[])
    );
    const secondaryIds = allContacts
      .filter((c) => c.id !== primary.id)
      .map((c) => c.id);

    res.json({
      contact: {
        primaryContatctId: primary.id,
        emails: uniqueEmails,
        phoneNumbers: uniquePhones,
        secondaryContactIds: secondaryIds,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

export default router;