import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { randomUUID } from "node:crypto";
import { FastifyInstance } from "fastify";
import { redis } from "../../lib/redis";
import { voting } from "../../utils/voting-pub-sub";

// A documentação do fastify pede para utilizar uma função async
export async function voteOnPoll(app: FastifyInstance) {
  app.post("/polls/:pollId/votes", async (req, res) => {
    const voteOnPollBody = z.object({ pollOptionId: z.string().uuid() });
    const voteOnPollParams = z.object({ pollId: z.string().uuid() });

    const { pollId } = voteOnPollParams.parse(req.params);
    const { pollOptionId } = voteOnPollBody.parse(req.body);

    let { sessionId } = req.cookies;

    if (sessionId) {
      const userPreviousVoteOnPoll = await prisma.vote.findUnique({
        where: { sessionId_pollId: { sessionId, pollId } }
      });

      if (
        userPreviousVoteOnPoll &&
        userPreviousVoteOnPoll.pollOptionId !== pollOptionId
      ) {
        await prisma.vote.delete({
          where: { id: userPreviousVoteOnPoll.id }
        });

        // Removendo o voto antigo dele caso ele troque seu voto na enquete.
        const votes = await redis.zincrby(
          pollId,
          -1,
          userPreviousVoteOnPoll.pollOptionId
        );

        voting.publish(pollId, {
          pollOptionId: userPreviousVoteOnPoll.pollOptionId,
          votes: Number(votes)
        });
      } else if (userPreviousVoteOnPoll) {
        return res.status(400).send({ message: "You already voted on this poll." });
      }
    }

    if (!sessionId) {
      sessionId = randomUUID();

      res.setCookie("sessionId", sessionId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        signed: true,
        httpOnly: true
      });
    }

    await prisma.vote.create({ data: { sessionId, pollId, pollOptionId } });
    const votes = await redis.zincrby(pollId, 1, pollOptionId);

    voting.publish(pollId, { pollOptionId, votes: Number(votes) });

    res.status(201).send();
  });
}
