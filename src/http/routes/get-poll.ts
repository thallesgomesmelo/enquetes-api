import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { FastifyInstance } from "fastify";
import { redis } from "../../lib/redis";

// A documentação do fastify pede para utilizar uma função async
export async function getPoll(app: FastifyInstance) {
  app.get("/polls/:pollId", async (req, res) => {
    const getPollParams = z.object({
      pollId: z.string().uuid()
    });

    const { pollId } = getPollParams.parse(req.params);
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: { select: { id: true, title: true } } }
    });

    // Caso não encontre o id da enquete passada pelo usuário.
    if (!poll) {
      return res.status(400).send({ message: "Poll not found." });
    }

    // Opção WITHSCORES trás a pontuação de cada uma das enquetes.
    const result = await redis.zrange(pollId, 0, -1, "WITHSCORES");

    /**
     * Convertendo o resulto que é um array para uma objeto usando o reduce.
     * Por estar usando typescript usa o Record para definir o tipo dos dados
     * do objeto.
     */
    const votes = result.reduce((obj, line, index) => {
      if (index % 2 === 0) {
        const score = result[index + 1];

        Object.assign(obj, { [line]: Number(score) });
      }

      return obj;
    }, {} as Record<string, number>);
    res.send({
      poll: {
        id: poll.id,
        title: poll.title,
        options: poll.options.map(option => {
          return {
            id: option.id,
            title: option.title,
            score: option.id in votes ? votes[option.id] : 0
          };
        })
      }
    });
  });
}
