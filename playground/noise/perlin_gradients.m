function gradients_per_octave = perlin_gradients(num_samples, num_dimensions, num_octaves)

%   PERLIN_GRADIENTS -- Create gradients from which to generate Perlin noise.

if ( nargin < 3 )
  num_octaves = 1;
end

if ( nargin < 2 )
  num_dimensions = 1;
end

gradients_per_octave = cell( num_octaves, 1 );

for i = 1:num_octaves  
  use_samples = repmat( num_samples, 1, num_dimensions );
  use_dims = [ num_dimensions, use_samples ];
  
  gradients = randn( use_dims );
  gradients = gradients ./ sqrt(sum(gradients .* gradients));
  gradients_per_octave{i} = gradients;
  
  num_samples = num_samples * 2;
end

end