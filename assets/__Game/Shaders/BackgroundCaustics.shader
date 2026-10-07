// Light on the sea floor: a soft web of bright lines laid over the sand, drifting. The sand's picture already
// carries a baked web, so the layer is meant to read as those lines moving, not as a second pattern: two samples
// of one tileable texture at different scales drift in opposite directions and are summed with a bonus where
// their lines cross. The quad's uvRect repeats the texture _Tiles times, and a vertical mask fades the effect in
// from the top of the quad, so the layer does not start on a hard edge in the open water.
// A smooth value-noise field (one evaluation, no texture) bends the sample positions of both layers, so the web
// wobbles like light through moving water instead of sliding rigidly; the field is laid out in the quad's own uv, not
// the web's, so the bend does not follow the texture repeats. Layer B takes the field's components swapped, which
// keeps the two bends apart and the crossings lively.
// The floor recedes: the web's uv is the quad's normalised position seen on a plane that tilts away towards the top
// (x / s, y / s with s = 1 - _Perspective * height), so the web is as large as before at the bottom and denser, and
// slower, further up. At 0 it is the flat web of before.
// Where the background picture underneath is dark - rocks, seaweed, deep water - the layer is switched off: the
// background is read again at the same spot (the quad is a child of the background image, so the map between the two
// is fixed, _BgMap) and its linear luminance gates the web. Sand is bright, those are not.
// Additive (One One): the black between the lines adds nothing.
Shader "FishJam/UI/BackgroundCaustics"
{
    Properties
    {
        [PerRendererData] _MainTex ("Caustic web (tileable)", 2D) = "black" {}
        _Color ("Tint", Color) = (1, 0.95, 0.75, 1)
        _Intensity ("Intensity", Float) = 0.3
        _Tiles ("Mask height scale: height = uv.y / y (x unused)", Vector) = (1.8, 1, 0, 0)
        _Repeat ("Texture repeats across the quad (x, y) = the RawImage's UV Rect size", Vector) = (2, 2, 0, 0)
        _ScaleA ("Scale A", Float) = 1
        _ScaleB ("Scale B", Float) = 0.66
        _Drift ("Drift speed", Float) = 1
        _Perspective ("Floor perspective: 0 = flat, towards 1 = recedes steeply at the top", Range(0, 0.9)) = 0.6
        [NoScaleOffset] _BgTex ("Background picture, read to skip dark objects (white = no skipping)", 2D) = "white" {}
        _BgMap ("Quad (0..1) to background uv: scale xy, offset zw", Vector) = (1, 0.4568, 0, 0)
        _DarkCut ("Linear luminance of the background: layer off below x, fully on above y", Vector) = (0.28, 0.55, 0, 0)
        _DistortAmount ("Noise distortion (web uv; 0 = off)", Float) = 0.04
        _DistortScale ("Noise cells across the quad's uv", Float) = 3
        _DistortSpeed ("Noise flow speed", Float) = 0.12
        _FadeFrom ("Mask: fully off from this height of the quad, fully on at the second", Vector) = (1.0, 0.6, 0, 0)
        _TimeOffset ("Time offset", Float) = 0
    }

    SubShader
    {
        Tags
        {
            "Queue"="Transparent"
            "IgnoreProjector"="True"
            "RenderType"="Transparent"
            "PreviewType"="Plane"
            "CanUseSpriteAtlas"="True"
        }

        Cull Off
        Lighting Off
        ZWrite Off
        ZTest [unity_GUIZTestMode]
        Blend One One

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 2.0
            #include "UnityCG.cginc"

            struct appdata_t
            {
                float4 vertex : POSITION;
                float4 color : COLOR;
                float2 texcoord : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct v2f
            {
                float4 vertex : SV_POSITION;
                fixed4 color : COLOR;
                float2 uv : TEXCOORD0;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            sampler2D _MainTex;
            fixed4 _Color;
            float _Intensity;
            float4 _Tiles;
            float4 _Repeat;
            float _ScaleA;
            float _ScaleB;
            float _Drift;
            float _Perspective;
            sampler2D _BgTex;
            float4 _BgMap;
            float4 _DarkCut;
            float _DistortAmount;
            float _DistortScale;
            float _DistortSpeed;
            float4 _FadeFrom;
            float _TimeOffset;

            // A random vector in [-1, 1]^2 for a lattice corner.
            float2 Hash22(float2 p)
            {
                p = float2(dot(p, float2(127.1, 311.7)), dot(p, float2(269.5, 183.3)));
                return frac(sin(p) * 43758.5453) * 2.0 - 1.0;
            }

            // Value noise with a vector per corner, smoothstep-blended.
            float2 Noise22(float2 p)
            {
                float2 cell = floor(p);
                float2 f = frac(p);
                float2 u = f * f * (3.0 - 2.0 * f);
                return lerp(lerp(Hash22(cell), Hash22(cell + float2(1.0, 0.0)), u.x),
                            lerp(Hash22(cell + float2(0.0, 1.0)), Hash22(cell + float2(1.0, 1.0)), u.x), u.y);
            }

            v2f vert(appdata_t v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.vertex = UnityObjectToClipPos(v.vertex);
                o.uv = v.texcoord;
                o.color = v.color * _Color;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float t = (_Time.y + _TimeOffset) * _Drift;

                // The field flows sideways and down as it is read, so the bend keeps changing rather than breathing in place.
                float2 warp = Noise22(i.uv * _DistortScale + float2(t * _DistortSpeed, -t * _DistortSpeed * 0.7)) * _DistortAmount;

                // The web on a floor that tilts away towards the top of the quad. The x term keeps the middle column
                // fixed; y / s is the plane's depth integrated from the bottom, so the bottom row is unscaled.
                float2 q = i.uv / _Repeat.xy;
                float s = max(1.0 - _Perspective * q.y, 0.05);
                float2 floorUv = float2((q.x - 0.5) / s + 0.5, q.y / s) * _Repeat.xy;

                float a = tex2D(_MainTex, floorUv * _ScaleA + float2(t * 0.020, t * 0.013) + warp).r;
                float b = tex2D(_MainTex, floorUv * _ScaleB + float2(-t * 0.017, t * 0.011) + warp.yx).r;
                float web = (a + b) * 0.5 + a * b;

                // Light lands on the sand, not on what stands in it: gate by how bright the picture is here.
                float3 bg = tex2D(_BgTex, q * _BgMap.xy + _BgMap.zw).rgb;
                float lit = smoothstep(_DarkCut.x, _DarkCut.y, dot(bg, float3(0.2126, 0.7152, 0.0722)));

                // The quad's own height, 1 at its top: uv.y runs 0.._Tiles.y.
                float height = i.uv.y / _Tiles.y;
                float mask = 1.0 - smoothstep(_FadeFrom.y, _FadeFrom.x, height);

                return fixed4(web * mask * lit * i.color.rgb * (_Intensity * i.color.a), 1.0);
            }
            ENDCG
        }
    }
}
