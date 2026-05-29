import {
  getScope,
  getSimulationConfigsCollection,
  nameExistsInCollection,
} from "@/lib/server/couchbase";
import { NextResponse } from "next/server";

export async function GET() {
  const scope = await getScope();
  const result = await scope.query(`
    SELECT META().id AS id,
           IFMISSINGORNULL(c.configName, null) AS name,
           IFMISSINGORNULL(c.createdAt, null) AS createdAt,
           IFMISSINGORNULL(c.content.simulation_speedup, null) AS speedup
    FROM simulationConfigs c
  `);

  return NextResponse.json({
    simulationConfigs: result,
    message: "Simulation config fetched successfully",
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  if (!body.formData) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  try {
    const formData = { ...body.formData };
    const name = formData.configName?.trim() || null;
    delete formData.configName;

    if (name && await nameExistsInCollection("simulationConfigs", "configName", name)) {
      return NextResponse.json(
        { error: `A simulation configuration named "${name}" already exists` },
        { status: 409 }
      );
    }

    const simulationConfigId = `simulation_config_${Math.random()
      .toString(16)
      .slice(2, 10)}`;

    const doc = {
      configName: name || simulationConfigId,
      createdAt: new Date().toISOString(),
      content: formData,
    };

    const collection = await getSimulationConfigsCollection();
    await collection.upsert(simulationConfigId, doc);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to create simulation configuration" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    message: "Simulation config created successfully",
  });
}
