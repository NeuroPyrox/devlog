"use strict";

import * as P from "../parsers.js";

const xml = `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
    <msapplication>
        <tile>
            <square150x150logo src="/mstile-150x150.png"/>
            <TileColor>#006600</TileColor>
        </tile>
    </msapplication>
</browserconfig>
`;

export default P.end.map((_) => (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/xml",
  });
  res.write(xml);
  res.end();
});
